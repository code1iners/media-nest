import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {
  ExtractionJobStatus,
  ExtractionType,
  Prisma,
  PrismaClient,
  SubtitleJobStatus,
} from '@mytube-extract/db';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { exec as youtubeExec, youtubeDl } from 'youtube-dl-exec';
import {
  appendProcessOutputTail,
  createAssetObjectKey,
  createContentDisposition,
  createContentType,
  createExpiresAt,
  createSubtitleContentType,
  createSubtitleResultObjectKey,
  createWhisperCliArgs,
  createWhisperModelEnvName,
  createWhisperSrtOutputPath,
  createVideoPreflightDecision,
  createWorkerHeartbeatUpsertArgs,
  createYtDlpFormat,
  DEFAULT_SUBTITLE_AUDIO_MAX_BYTES,
  DEFAULT_WHISPER_LANGUAGE,
  normalizeSubtitleWorkerFailureCode,
  normalizeWhisperSrt,
  normalizeExtractedAssetTitle,
  parseEnvNumber,
  selectNextQueuedWorkerJob,
  SubtitleWorkerFailureCode,
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

/** local Whisper에 보낼 audio 최대 byte. */
const SUBTITLE_AUDIO_MAX_BYTES = parseEnvNumber(
  process.env.SUBTITLE_AUDIO_MAX_BYTES,
  DEFAULT_SUBTITLE_AUDIO_MAX_BYTES,
);

/** whisper.cpp worker thread 수. */
const WHISPER_THREADS = parseEnvNumber(process.env.WHISPER_THREADS, 4);

/** CTA 1은 영어 SRT만 생성한다. */
const WHISPER_LANGUAGE =
  process.env.WHISPER_LANGUAGE?.trim() || DEFAULT_WHISPER_LANGUAGE;

/** R2 multipart upload part 크기. */
const R2_UPLOAD_PART_SIZE_BYTES = 16 * 1024 * 1024;

/** R2 multipart upload 동시 part 수. */
const R2_UPLOAD_QUEUE_SIZE = 2;

/** Prisma client. */
const prisma = new PrismaClient();

/** claim된 다운로드 job 처리에 필요한 표면. */
type ClaimedDownloadJob = {
  /** job ID. */
  id: string;
  /** 요청 URL. */
  url: string;
  /** YouTube video ID. */
  videoId: string;
  /** 추출 type. */
  type: ExtractionType;
  /** 선택 품질. */
  quality: string;
};

/** claim된 자막 job 처리에 필요한 표면. */
type ClaimedSubtitleJob = {
  /** job ID. */
  id: string;
  /** R2 source object key. */
  sourceObjectKey: string;
  /** 선택한 Whisper 모델. */
  whisperModel: string;
};

/** claim된 worker job. */
type ClaimedWorkerJob =
  | {
      /** worker job 종류. */
      kind: 'download';
      /** 다운로드 job. */
      job: ClaimedDownloadJob;
    }
  | {
      /** worker job 종류. */
      kind: 'subtitle';
      /** 자막 job. */
      job: ClaimedSubtitleJob;
    };

/** 실패 메시지에 남길 child process 로그 tail 길이. */
const CHILD_PROCESS_LOG_TAIL_CHARACTERS = 12_000;

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

    /** FIFO로 claim한 다음 worker job. */
    const claimedJob = await claimNextQueuedJob();

    if (claimedJob?.kind === 'download') {
      await processJob(claimedJob.job);
      continue;
    }

    if (claimedJob?.kind === 'subtitle') {
      await processSubtitleJob(claimedJob.job);
      continue;
    }

    await sleep(LOOP_INTERVAL_MS);
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

  await prisma.subtitleJob.updateMany({
    data: {
      errorCode: null,
      errorDetail: null,
      startedAt: null,
      status: SubtitleJobStatus.queued,
    },
    where: {
      startedAt: {
        lt: cutoff,
      },
      status: {
        in: [
          SubtitleJobStatus.extracting_audio,
          SubtitleJobStatus.transcribing,
        ],
      },
    },
  });
}

/** download/subtitle 전체 queued job 중 가장 오래된 하나를 claim한다. */
async function claimNextQueuedJob(): Promise<ClaimedWorkerJob | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          /** 이미 처리 중인 다운로드 job. */
          const processingJob = await tx.extractionJob.findFirst({
            select: { id: true },
            where: { status: ExtractionJobStatus.processing },
          });
          /** 이미 처리 중인 자막 job. */
          const processingSubtitleJob = await tx.subtitleJob.findFirst({
            select: { id: true },
            where: {
              status: {
                in: [
                  SubtitleJobStatus.extracting_audio,
                  SubtitleJobStatus.transcribing,
                ],
              },
            },
          });

          if (processingJob || processingSubtitleJob) {
            return null;
          }

          /** 가장 오래된 queued 다운로드 job 후보. */
          const nextDownloadJob = await tx.extractionJob.findFirst({
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            where: { status: ExtractionJobStatus.queued },
          });
          /** 가장 오래된 queued 자막 job 후보. */
          const nextSubtitleJob = await tx.subtitleJob.findFirst({
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            where: { status: SubtitleJobStatus.queued },
          });
          /** 실제 처리할 FIFO job 후보. */
          const selectedJob = selectNextQueuedWorkerJob({
            downloadJob: nextDownloadJob,
            subtitleJob: nextSubtitleJob,
          });

          if (!selectedJob) {
            return null;
          }

          if (selectedJob.kind === 'download') {
            /** claim된 다운로드 job. */
            const job = await tx.extractionJob.update({
              data: {
                errorCode: null,
                errorDetail: null,
                startedAt: new Date(),
                status: ExtractionJobStatus.processing,
              },
              where: {
                id: selectedJob.id,
                status: ExtractionJobStatus.queued,
              },
            });

            return { job, kind: 'download' };
          }

          /** claim된 자막 job. */
          const job = await tx.subtitleJob.update({
            data: {
              errorCode: null,
              errorDetail: null,
              startedAt: new Date(),
              status: SubtitleJobStatus.extracting_audio,
            },
            where: {
              id: selectedJob.id,
              status: SubtitleJobStatus.queued,
            },
          });

          return { job, kind: 'subtitle' };
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
async function processJob(job: ClaimedDownloadJob) {
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

/** claim된 자막 job을 영어 SRT로 변환하고 R2에 업로드한다. */
async function processSubtitleJob(job: ClaimedSubtitleJob) {
  /** 요청별 worker 임시 디렉터리. */
  const workDir = await mkdtemp(join(tmpdir(), 'mytube-subtitle-'));
  /** 다운로드한 원본 영상 경로. */
  const sourcePath = resolve(workDir, 'source');
  /** local Whisper에 넘길 mono wav 경로. */
  const audioPath = resolve(workDir, 'audio.wav');
  /** 확장자를 제외한 local Whisper 출력 경로. */
  const srtOutputBasePath = resolve(workDir, 'english');
  /** 결과 SRT R2 object key. */
  const resultObjectKey = createSubtitleResultObjectKey(job.id);

  try {
    await downloadObject(job.sourceObjectKey, sourcePath);
  } catch (error) {
    await markSubtitleFailed(job.id, 'SOURCE_DOWNLOAD_FAILED', error);
    await rm(workDir, { force: true, recursive: true });
    return;
  }

  try {
    await extractSubtitleAudio(sourcePath, audioPath);
    await assertSubtitleAudioSize(audioPath);

    await prisma.subtitleJob.update({
      data: { status: SubtitleJobStatus.transcribing },
      where: { id: job.id },
    });

    /** local Whisper에서 생성한 SRT 본문. */
    const srt = await transcribeAudioToSrt(
      audioPath,
      srtOutputBasePath,
      job.whisperModel,
    );

    try {
      await uploadBuffer(
        resultObjectKey,
        Buffer.from(srt),
        createSubtitleContentType(),
      );
    } catch (error) {
      await markSubtitleFailed(job.id, 'UPLOAD_FAILED', error);
      return;
    }

    await prisma.subtitleJob.update({
      data: {
        errorCode: null,
        errorDetail: null,
        resultObjectKey,
        status: SubtitleJobStatus.completed,
      },
      where: { id: job.id },
    });
  } catch (error) {
    await markSubtitleFailed(
      job.id,
      getSubtitleWorkerFailureCode(error),
      error,
    );
  } finally {
    await rm(workDir, { force: true, recursive: true });
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

/** R2 object를 로컬 파일로 저장한다. */
async function downloadObject(objectKey: string, filePath: string) {
  /** R2 object 조회 결과. */
  const output = await r2Client.send(
    new GetObjectCommand({
      Bucket: readRequiredEnv('R2_BUCKET'),
      Key: objectKey,
    }),
  );

  if (!output.Body) {
    throw new Error('R2 object body is empty');
  }

  if (output.Body instanceof Readable) {
    await pipeline(output.Body, createWriteStream(filePath));
    return;
  }

  /** Node SDK body fallback. */
  const transformableBody = output.Body as {
    transformToByteArray?: () => Promise<Uint8Array>;
  };

  if (typeof transformableBody.transformToByteArray === 'function') {
    await pipeline(
      Readable.from(
        Buffer.from(await transformableBody.transformToByteArray()),
      ),
      createWriteStream(filePath),
    );
    return;
  }

  throw new Error('R2 object body is not streamable');
}

/** ffmpeg로 local Whisper 입력용 mono wav를 추출한다. */
async function extractSubtitleAudio(sourcePath: string, audioPath: string) {
  /** ffmpeg 실행 파일 경로. */
  const ffmpegPath =
    process.env.FFMPEG_LOCATION && existsSync(process.env.FFMPEG_LOCATION)
      ? process.env.FFMPEG_LOCATION
      : 'ffmpeg';

  await runCommand(ffmpegPath, [
    '-y',
    '-i',
    sourcePath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    audioPath,
  ]);
}

/** 추출된 audio가 local Whisper 처리 제한 안인지 확인한다. */
async function assertSubtitleAudioSize(audioPath: string) {
  /** 추출된 audio 파일 상태. */
  const audioStat = await stat(audioPath);

  if (audioStat.size > SUBTITLE_AUDIO_MAX_BYTES) {
    throw new SubtitleWorkerJobFailure(
      'AUDIO_TOO_LARGE',
      `subtitle audio is too large: ${audioStat.size} bytes`,
    );
  }
}

/** local whisper.cpp CLI로 영어 SRT를 생성한다. */
async function transcribeAudioToSrt(
  audioPath: string,
  srtOutputBasePath: string,
  whisperModel: string,
) {
  /** whisper.cpp CLI 경로. */
  const cliPath = readWhisperFileEnv('WHISPER_CLI_PATH');
  /** whisper.cpp model 파일 경로. */
  const modelPath = readWhisperModelPath(whisperModel);
  /** whisper.cpp가 생성할 SRT 경로. */
  const srtPath = createWhisperSrtOutputPath(srtOutputBasePath);

  try {
    await runCommand(
      cliPath,
      createWhisperCliArgs({
        audioPath,
        language: WHISPER_LANGUAGE,
        modelPath,
        outputBasePath: srtOutputBasePath,
        threads: WHISPER_THREADS,
      }),
      { cwd: resolve(srtOutputBasePath, '..') },
    );
  } catch (error) {
    throw new SubtitleWorkerJobFailure(
      'TRANSCRIPTION_FAILED',
      `whisper.cpp failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!existsSync(srtPath)) {
    throw new SubtitleWorkerJobFailure(
      'TRANSCRIPTION_FAILED',
      'whisper.cpp did not create SRT file',
    );
  }

  /** whisper.cpp가 생성한 SRT 본문. */
  const srt = normalizeWhisperSrt(
    await readFile(srtPath, { encoding: 'utf8' }),
  );

  return srt;
}

/** 장시간 실행되는 CLI 출력을 버퍼 제한 없이 소비한다. */
async function runCommand(
  command: string,
  args: string[],
  options: {
    /** child process working directory. */
    cwd?: string;
  } = {},
) {
  /** 실행할 child process. */
  const child = spawn(command, args, {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  /** 실패 원인 확인용 stdout/stderr tail. */
  let outputTail = '';

  child.stdout.on('data', (chunk: Buffer) => {
    process.stdout.write(chunk);
    outputTail = appendProcessOutputTail(
      outputTail,
      chunk.toString('utf8'),
      CHILD_PROCESS_LOG_TAIL_CHARACTERS,
    );
  });
  child.stderr.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk);
    outputTail = appendProcessOutputTail(
      outputTail,
      chunk.toString('utf8'),
      CHILD_PROCESS_LOG_TAIL_CHARACTERS,
    );
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `${command} exited with ${
            signal ? `signal ${signal}` : `code ${code}`
          }${outputTail ? `\n${outputTail}` : ''}`,
        ),
      );
    });
  });
}

/** 선택한 Whisper 모델에 맞는 파일 경로를 읽는다. */
function readWhisperModelPath(whisperModel: string) {
  /** 모델별 환경 변수 이름. */
  const envName = createWhisperModelEnvName(whisperModel);

  if (!envName) {
    throw new SubtitleWorkerJobFailure(
      'TRANSCRIPTION_FAILED',
      `unsupported whisper model: ${whisperModel}`,
    );
  }

  return readWhisperFileEnv(envName);
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

/** Buffer 본문을 R2 object로 업로드한다. */
async function uploadBuffer(
  objectKey: string,
  body: Buffer,
  contentType: string,
) {
  await new Upload({
    client: r2Client,
    leavePartsOnError: false,
    params: {
      Body: body,
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

/** 자막 job을 failed로 표시한다. */
async function markSubtitleFailed(
  jobId: string,
  errorCode: string,
  error: unknown,
) {
  await prisma.subtitleJob.update({
    data: {
      errorCode,
      errorDetail: error instanceof Error ? error.message : String(error),
      status: SubtitleJobStatus.failed,
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

/** 자막 worker job 실패 코드와 원인을 함께 전달하는 에러. */
class SubtitleWorkerJobFailure extends Error {
  constructor(
    /** DB에 저장할 실패 코드. */
    readonly errorCode: SubtitleWorkerFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'SubtitleWorkerJobFailure';
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

/** unknown error에서 자막 DB에 저장할 실패 코드를 고른다. */
function getSubtitleWorkerFailureCode(
  error: unknown,
): SubtitleWorkerFailureCode {
  if (error instanceof SubtitleWorkerJobFailure) {
    return normalizeSubtitleWorkerFailureCode(error.errorCode);
  }

  return normalizeSubtitleWorkerFailureCode(undefined);
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

/** whisper.cpp 파일 경로 환경 변수를 job 실패로 바꿔 읽는다. */
function readWhisperFileEnv(name: string) {
  /** 환경 변수 값. */
  const value = process.env[name]?.trim();

  if (!value) {
    throw new SubtitleWorkerJobFailure(
      'TRANSCRIPTION_FAILED',
      `${name} is required`,
    );
  }

  if (!existsSync(value)) {
    throw new SubtitleWorkerJobFailure(
      'TRANSCRIPTION_FAILED',
      `${name} does not exist: ${value}`,
    );
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
