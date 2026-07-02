import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {
  ExtractionJobStatus,
  ExtractionType,
  Prisma,
  PrismaClient,
} from '@mytube-extract/db';
import { createReadStream, existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { exec as youtubeExec, youtubeDl } from 'youtube-dl-exec';
import {
  createAssetObjectKey,
  createContentDisposition,
  createContentType,
  createExpiresAt,
  createVideoPreflightDecision,
  createWorkerHeartbeatUpsertArgs,
  createYtDlpFormat,
  normalizeExtractedAssetTitle,
  parseEnvNumber,
  WorkerFailureCode,
} from './worker.logic';

/** worker idle polling 간격. */
const LOOP_INTERVAL_MS = parseEnvNumber(
  process.env.WORKER_LOOP_INTERVAL_MS,
  5_000,
);

/** processing stuck 복구 기준. */
const PROCESSING_TIMEOUT_MS = parseEnvNumber(
  process.env.WORKER_PROCESSING_TIMEOUT_MS,
  60 * 60 * 1000,
);

/** asset 보관 기간. */
const ASSET_RETENTION_DAYS = parseEnvNumber(
  process.env.ASSET_RETENTION_DAYS,
  7,
);

/** R2 multipart upload part 크기. */
const R2_UPLOAD_PART_SIZE_BYTES = 16 * 1024 * 1024;

/** R2 multipart upload 동시 part 수. */
const R2_UPLOAD_QUEUE_SIZE = 2;

/** Prisma client. */
const prisma = new PrismaClient();

/** worker heartbeat timer. */
let heartbeatTimer: NodeJS.Timeout | null = null;

/** R2 S3 compatible client. */
const r2Client = new S3Client({
  credentials: {
    accessKeyId: readRequiredEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: readRequiredEnv('R2_SECRET_ACCESS_KEY'),
  },
  endpoint: readRequiredEnv('R2_ENDPOINT'),
  region: 'auto',
});

/** worker main loop. */
async function main() {
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  startHeartbeat();

  while (true) {
    await restoreStuckJobs();

    /** FIFO로 claim한 다음 job. */
    const job = await claimNextJob();

    if (!job) {
      await sleep(LOOP_INTERVAL_MS);
      continue;
    }

    await processJob(job);
  }
}

/** 긴 job 처리 중에도 worker 생존 신호를 별도로 기록한다. */
function startHeartbeat() {
  void writeHeartbeat();
  heartbeatTimer = setInterval(() => {
    void writeHeartbeat();
  }, LOOP_INTERVAL_MS);
}

/** worker heartbeat row를 갱신한다. */
async function writeHeartbeat() {
  try {
    await prisma.workerHeartbeat.upsert(createWorkerHeartbeatUpsertArgs());
  } catch (error) {
    console.error('Worker heartbeat update failed', error);
  }
}

/** stuck processing job을 queued로 돌린다. */
async function restoreStuckJobs() {
  /** stuck 기준 시각. */
  const cutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MS);

  await prisma.extractionJob.updateMany({
    data: {
      errorCode: null,
      errorDetail: null,
      startedAt: null,
      status: ExtractionJobStatus.queued,
    },
    where: {
      startedAt: {
        lt: cutoff,
      },
      status: ExtractionJobStatus.processing,
    },
  });
}

/** oldest queued job 하나를 processing으로 claim한다. */
async function claimNextJob() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          /** 이미 처리 중인 job. */
          const processingJob = await tx.extractionJob.findFirst({
            select: { id: true },
            where: { status: ExtractionJobStatus.processing },
          });

          if (processingJob) {
            return null;
          }

          /** 가장 오래된 queued job. */
          const nextJob = await tx.extractionJob.findFirst({
            orderBy: { createdAt: 'asc' },
            where: { status: ExtractionJobStatus.queued },
          });

          if (!nextJob) {
            return null;
          }

          return tx.extractionJob.update({
            data: {
              errorCode: null,
              errorDetail: null,
              startedAt: new Date(),
              status: ExtractionJobStatus.processing,
            },
            where: {
              id: nextJob.id,
              status: ExtractionJobStatus.queued,
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2034') {
        throw error;
      }
    }
  }

  return null;
}

/** claim된 job을 추출하고 R2에 업로드한다. */
async function processJob(job: Awaited<ReturnType<typeof claimNextJob>>) {
  if (!job) {
    return;
  }

  try {
    /** worker 처리 직전 재사용 가능한 asset 후보. */
    const reusableAsset = await prisma.extractedAsset.findFirst({
      where: {
        expiresAt: { gt: new Date() },
        quality: job.quality,
        type: job.type,
        videoId: job.videoId,
      },
    });

    if (reusableAsset) {
      if (await objectExists(reusableAsset.objectKey)) {
        await markCompleted(job.id, reusableAsset.id);
        return;
      }

      await prisma.extractedAsset.delete({
        where: { id: reusableAsset.id },
      });
    }

    /** R2 object key. */
    const objectKey = createAssetObjectKey(job.videoId, job.type, job.quality);
    /** 원본 영상 제목. */
    const title = await readExtractedAssetTitle(job.url);
    /** 추출 결과 임시 파일 경로. */
    const outputPath = await downloadJob(job);

    try {
      await uploadObject(objectKey, outputPath, createContentType(job.type));
    } catch (error) {
      await markFailed(job.id, 'UPLOAD_FAILED', error);
      return;
    } finally {
      await rm(resolve(outputPath, '..'), { force: true, recursive: true });
    }

    /** 업로드 완료 후 저장할 asset row. */
    const asset = await prisma.extractedAsset.upsert({
      create: {
        expiresAt: createExpiresAt(ASSET_RETENTION_DAYS),
        objectKey,
        quality: job.quality,
        title,
        type: job.type,
        videoId: job.videoId,
      },
      update: {
        expiresAt: createExpiresAt(ASSET_RETENTION_DAYS),
        objectKey,
        title,
      },
      where: {
        videoId_type_quality: {
          quality: job.quality,
          type: job.type,
          videoId: job.videoId,
        },
      },
    });

    await markCompleted(job.id, asset.id);
  } catch (error) {
    await markFailed(job.id, getWorkerFailureCode(error), error);
  }
}

/** yt-dlp metadata에서 원본 영상 제목을 best-effort로 읽는다. */
async function readExtractedAssetTitle(url: string) {
  try {
    /** yt-dlp --get-title 출력값. */
    const title = await youtubeDl(url, {
      getTitle: true,
      jsRuntimes: 'node',
      noPlaylist: true,
    });

    return normalizeExtractedAssetTitle(title);
  } catch (error) {
    console.warn(
      `Failed reading video title: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

/** yt-dlp로 job 파일을 만든다. */
async function downloadJob(job: {
  /** 요청 URL. */
  url: string;
  /** 추출 type. */
  type: ExtractionType;
  /** 품질 key. */
  quality: string;
}) {
  /** yt-dlp format selector. */
  const format = createYtDlpFormat(job.type, job.quality);

  if (job.type === ExtractionType.video) {
    await assertVideoPreflight(job.url, format);
  }

  /** 요청별 worker 임시 디렉터리. */
  const workDir = await mkdtemp(join(tmpdir(), `mytube-worker-${job.type}-`));
  /** 출력 파일 확장자. */
  const extension = job.type === ExtractionType.audio ? 'mp3' : 'mp4';
  /** yt-dlp 출력 경로. */
  const outputPath = resolve(workDir, `output.${extension}`);
  /** ffmpeg 경로 환경 변수. */
  const ffmpegLocation = process.env.FFMPEG_LOCATION;

  try {
    await youtubeExec(job.url, {
      addMetadata: true,
      format,
      ignoreErrors: true,
      jsRuntimes: 'node',
      output: outputPath,
      ...(ffmpegLocation && existsSync(ffmpegLocation)
        ? { ffmpegLocation }
        : {}),
      ...(job.type === ExtractionType.audio
        ? { audioFormat: 'mp3' as const, extractAudio: true }
        : { mergeOutputFormat: 'mp4' as const }),
    });
  } catch (error) {
    await rm(workDir, { force: true, recursive: true });
    throw error;
  }

  return outputPath;
}

/** R2 object를 업로드한다. */
async function uploadObject(
  objectKey: string,
  filePath: string,
  contentType: string,
) {
  await new Upload({
    client: r2Client,
    leavePartsOnError: false,
    params: {
      Body: createReadStream(filePath),
      Bucket: readRequiredEnv('R2_BUCKET'),
      ContentDisposition: createContentDisposition(objectKey),
      ContentType: contentType,
      Key: objectKey,
    },
    partSize: R2_UPLOAD_PART_SIZE_BYTES,
    queueSize: R2_UPLOAD_QUEUE_SIZE,
  }).done();
}

/** 실제 R2 object가 존재하는지 확인한다. */
async function objectExists(objectKey: string) {
  try {
    await r2Client.send(
      new HeadObjectCommand({
        Bucket: readRequiredEnv('R2_BUCKET'),
        Key: objectKey,
      }),
    );

    return true;
  } catch (error) {
    if (isMissingObjectError(error)) {
      return false;
    }

    throw error;
  }
}

/** job을 completed로 표시한다. */
async function markCompleted(jobId: string, assetId: string) {
  await prisma.extractionJob.update({
    data: {
      assetId,
      errorCode: null,
      errorDetail: null,
      status: ExtractionJobStatus.completed,
    },
    where: { id: jobId },
  });
}

/** R2 S3 API가 object key를 못 찾은 경우인지 확인한다. */
function isMissingObjectError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (('Code' in error &&
      (error.Code === 'NoSuchKey' || error.Code === 'NotFound')) ||
      ('$metadata' in error &&
        (error.$metadata as { httpStatusCode?: number }).httpStatusCode ===
          404))
  );
}

/** job을 failed로 표시한다. */
async function markFailed(jobId: string, errorCode: string, error: unknown) {
  await prisma.extractionJob.update({
    data: {
      errorCode,
      errorDetail: error instanceof Error ? error.message : String(error),
      status: ExtractionJobStatus.failed,
    },
    where: { id: jobId },
  });
}

/** video 다운로드 전 선택 format이 worker 처리 정책 안에 있는지 확인한다. */
async function assertVideoPreflight(url: string, format: string) {
  /** yt-dlp format selector가 적용된 metadata. */
  const metadata = await youtubeDl(url, {
    dumpSingleJson: true,
    format,
    jsRuntimes: 'node',
    noPlaylist: true,
  });
  /** worker 처리 가능 여부. */
  const decision = createVideoPreflightDecision(metadata);

  if (!decision.ok) {
    throw new WorkerJobFailure(decision.errorCode, decision.message);
  }

  console.log(
    `Video preflight passed: formats=${decision.formatIds.join(',') || 'unknown'} estimatedBytes=${
      decision.estimatedBytes ?? 'unknown'
    }`,
  );
}

/** worker job 실패 코드와 원인을 함께 전달하는 에러. */
class WorkerJobFailure extends Error {
  constructor(
    /** DB에 저장할 실패 코드. */
    readonly errorCode: WorkerFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkerJobFailure';
  }
}

/** unknown error에서 DB에 저장할 실패 코드를 고른다. */
function getWorkerFailureCode(error: unknown): WorkerFailureCode {
  if (error instanceof WorkerJobFailure) {
    return error.errorCode;
  }

  if (
    error instanceof Error &&
    (error.message.includes('Sign in to confirm you') ||
      error.message.includes('LOGIN_REQUIRED'))
  ) {
    return 'YOUTUBE_AUTH_REQUIRED';
  }

  return 'EXTRACTION_FAILED';
}

/** 필수 환경 변수를 읽는다. */
function readRequiredEnv(name: string) {
  /** 환경 변수 값. */
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

/** 지정 시간만큼 쉰다. */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 종료 signal 처리. */
async function shutdown() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  await prisma.$disconnect();
  process.exit(0);
}

void main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
