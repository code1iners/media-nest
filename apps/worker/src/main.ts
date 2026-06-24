import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  ExtractionJobStatus,
  ExtractionType,
  Prisma,
  PrismaClient,
} from '@mytube-extract/db';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { exec as youtubeExec } from 'youtube-dl-exec';
import {
  createAssetObjectKey,
  createContentDisposition,
  createContentType,
  createExpiresAt,
  createYtDlpFormat,
  parseEnvNumber,
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

/** Prisma client. */
const prisma = new PrismaClient();

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
        type: job.type,
        videoId: job.videoId,
      },
      update: {
        expiresAt: createExpiresAt(ASSET_RETENTION_DAYS),
        objectKey,
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
    await markFailed(job.id, 'EXTRACTION_FAILED', error);
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
  /** 요청별 worker 임시 디렉터리. */
  const workDir = await mkdtemp(join(tmpdir(), `mytube-worker-${job.type}-`));
  /** 출력 파일 확장자. */
  const extension = job.type === ExtractionType.audio ? 'mp3' : 'mp4';
  /** yt-dlp 출력 경로. */
  const outputPath = resolve(workDir, `output.${extension}`);
  /** ffmpeg 경로 환경 변수. */
  const ffmpegLocation = process.env.FFMPEG_LOCATION;

  await youtubeExec(job.url, {
    addMetadata: true,
    format: createYtDlpFormat(job.type, job.quality),
    ignoreErrors: true,
    jsRuntimes: 'node',
    output: outputPath,
    ...(ffmpegLocation && existsSync(ffmpegLocation) ? { ffmpegLocation } : {}),
    ...(job.type === ExtractionType.audio
      ? { audioFormat: 'mp3' as const, extractAudio: true }
      : { mergeOutputFormat: 'mp4' as const }),
  });

  return outputPath;
}

/** R2 object를 업로드한다. */
async function uploadObject(
  objectKey: string,
  filePath: string,
  contentType: string,
) {
  await r2Client.send(
    new PutObjectCommand({
      Body: await readFile(filePath),
      Bucket: readRequiredEnv('R2_BUCKET'),
      ContentDisposition: createContentDisposition(objectKey),
      ContentType: contentType,
      Key: objectKey,
    }),
  );
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
  await prisma.$disconnect();
  process.exit(0);
}

void main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
