import { ExtractionType, SubtitleJobStatus } from '@mytube-extract/db';

/** 단일 worker heartbeat row ID. */
export const WORKER_HEARTBEAT_ID = 'default';

/** worker에서 처리하는 품질 key. */
export type WorkerQuality = '128' | '192' | '320' | '360' | '720' | '1080';

/** worker가 처리할 수 있는 video 예상 최대 크기. */
export const MAX_VIDEO_ESTIMATED_BYTES = 1024 * 1024 * 1024;

/** worker가 client에 전달할 수 있는 실패 코드. */
export type WorkerFailureCode =
  | 'EXTRACTION_FAILED'
  | 'UPLOAD_FAILED'
  | 'VIDEO_TOO_LARGE'
  | 'YOUTUBE_AUTH_REQUIRED'
  | 'YOUTUBE_FORMAT_UNAVAILABLE';

/** 자막 worker가 client에 전달할 수 있는 실패 코드. */
export type SubtitleWorkerFailureCode =
  | 'AUDIO_TOO_LARGE'
  | 'SOURCE_DOWNLOAD_FAILED'
  | 'TRANSCRIPTION_FAILED'
  | 'UPLOAD_FAILED';

/** local Whisper 입력 audio 기본 최대 크기. */
export const DEFAULT_SUBTITLE_AUDIO_MAX_BYTES = 512 * 1024 * 1024;

/** child process 실패 메시지에 남길 로그 tail 길이를 제한한다. */
export function appendProcessOutputTail(
  current: string,
  chunk: string,
  maxCharacters: number,
) {
  /** 이어 붙인 process 출력. */
  const combined = `${current}${chunk}`;

  if (combined.length <= maxCharacters) {
    return combined;
  }

  return combined.slice(-maxCharacters);
}

/** CTA 1 자막 생성 언어. */
export const DEFAULT_WHISPER_LANGUAGE = 'en';

/** 기본 Whisper 모델. */
export const DEFAULT_WHISPER_MODEL = 'base_en';

/** yt-dlp format metadata 중 preflight에 필요한 표면. */
type YtDlpFormatMetadata = {
  /** format 식별자. */
  format_id?: unknown;
  /** 정확한 파일 크기. */
  filesize?: unknown;
  /** 추정 파일 크기. */
  filesize_approx?: unknown;
  /** 영상 높이. */
  height?: unknown;
  /** frame rate. */
  fps?: unknown;
};

/** yt-dlp metadata 중 preflight에 필요한 표면. */
type YtDlpPreflightMetadata = YtDlpFormatMetadata & {
  /** 선택된 분리 format 목록. */
  requested_formats?: unknown;
};

/** video preflight 통과 결과. */
type VideoPreflightOk = {
  /** 처리 가능 여부. */
  ok: true;
  /** 선택된 format ID 목록. */
  formatIds: string[];
  /** 확인 가능한 예상 byte 합계. */
  estimatedBytes: number | null;
};

/** video preflight 실패 결과. */
type VideoPreflightFailed = {
  /** 처리 가능 여부. */
  ok: false;
  /** worker 실패 코드. */
  errorCode: WorkerFailureCode;
  /** server-only 상세 메시지. */
  message: string;
  /** 선택된 format ID 목록. */
  formatIds: string[];
  /** 확인 가능한 예상 byte 합계. */
  estimatedBytes: number | null;
};

/** video preflight 판단 결과. */
export type VideoPreflightDecision = VideoPreflightOk | VideoPreflightFailed;

/** queued worker job 후보 종류. */
export type QueuedWorkerJobKind = 'download' | 'subtitle';

/** queued worker job 정렬에 필요한 최소 표면. */
export type QueuedWorkerJobCandidate = {
  /** job ID. */
  id: string;
  /** job 생성 시각. */
  createdAt: Date;
};

/** R2 object key를 만든다. */
export function createAssetObjectKey(
  videoId: string,
  type: ExtractionType,
  quality: string,
) {
  /** 출력 확장자. */
  const extension = type === ExtractionType.audio ? 'mp3' : 'mp4';

  return `extracts/${videoId}/${type}-${quality}.${extension}`;
}

/** 영어 SRT R2 object key를 만든다. */
export function createSubtitleResultObjectKey(jobId: string) {
  return `subtitles/${jobId}/english.srt`;
}

/** 품질 key와 type으로 yt-dlp format selector를 만든다. */
export function createYtDlpFormat(type: ExtractionType, quality: string) {
  if (type === ExtractionType.audio) {
    return `bestaudio[abr<=${quality}]/best`;
  }

  return `bestvideo[height<=${quality}]+bestaudio/best`;
}

/** yt-dlp metadata를 이용해 worker 처리 가능 여부를 사전 판단한다. */
export function createVideoPreflightDecision(
  metadata: unknown,
  maxEstimatedBytes = MAX_VIDEO_ESTIMATED_BYTES,
): VideoPreflightDecision {
  /** 선택된 format 후보. */
  const selectedFormats = extractSelectedFormats(metadata);
  /** 선택된 format ID 목록. */
  const formatIds = selectedFormats
    .map((format) => normalizeString(format.format_id))
    .filter(Boolean);
  /** 확인 가능한 format 크기 목록. */
  const formatSizes = selectedFormats
    .map((format) => normalizeNumber(format.filesize ?? format.filesize_approx))
    .filter((size): size is number => size !== null);
  /** 모든 선택 format의 예상 byte 합계. */
  const estimatedBytes =
    selectedFormats.length > 0 && formatSizes.length === selectedFormats.length
      ? formatSizes.reduce((sum, size) => sum + size, 0)
      : null;

  if (selectedFormats.length === 0) {
    return {
      errorCode: 'YOUTUBE_FORMAT_UNAVAILABLE',
      estimatedBytes,
      formatIds,
      message: 'yt-dlp did not return selected video formats',
      ok: false,
    };
  }

  if (estimatedBytes === null) {
    return {
      errorCode: 'YOUTUBE_FORMAT_UNAVAILABLE',
      estimatedBytes,
      formatIds,
      message: 'yt-dlp selected video formats without complete size metadata',
      ok: false,
    };
  }

  if (estimatedBytes !== null && estimatedBytes > maxEstimatedBytes) {
    return {
      errorCode: 'VIDEO_TOO_LARGE',
      estimatedBytes,
      formatIds,
      message: `selected video is too large: ${estimatedBytes} bytes`,
      ok: false,
    };
  }

  return {
    estimatedBytes,
    formatIds,
    ok: true,
  };
}

/** 출력 파일 MIME type을 만든다. */
export function createContentType(type: ExtractionType) {
  return type === ExtractionType.audio ? 'audio/mpeg' : 'video/mp4';
}

/** 자막 결과 파일 MIME type을 만든다. */
export function createSubtitleContentType() {
  return 'application/x-subrip; charset=utf-8';
}

/** whisper.cpp CLI 실행 인자를 만든다. */
export function createWhisperCliArgs(input: {
  /** Whisper에 전달할 wav audio 경로. */
  audioPath: string;
  /** Whisper 인식 언어. */
  language: string;
  /** whisper.cpp 모델 파일 경로. */
  modelPath: string;
  /** 확장자를 제외한 SRT 출력 경로. */
  outputBasePath: string;
  /** whisper.cpp worker thread 수. */
  threads?: number;
}) {
  /** whisper.cpp 공통 실행 인자. */
  const args = [
    '-m',
    input.modelPath,
    '-f',
    input.audioPath,
    '-l',
    input.language,
    '-np',
    '-osrt',
    '-of',
    input.outputBasePath,
  ];

  if (input.threads && input.threads > 0) {
    args.push('-t', String(input.threads));
  }

  return args;
}

/** Whisper 모델별 환경 변수 이름을 반환한다. */
export function createWhisperModelEnvName(model: string) {
  if (model === 'base_en') {
    return 'WHISPER_MODEL_BASE_EN_PATH';
  }

  if (model === 'small_en') {
    return 'WHISPER_MODEL_SMALL_EN_PATH';
  }

  return null;
}

/** whisper.cpp가 만드는 SRT 파일 경로를 계산한다. */
export function createWhisperSrtOutputPath(outputBasePath: string) {
  return `${outputBasePath}.srt`;
}

/** whisper.cpp SRT 결과를 업로드 가능한 본문으로 정리한다. */
export function normalizeWhisperSrt(content: string) {
  /** 앞뒤 공백만 제거한 SRT 본문. */
  const normalizedContent = content.trim();

  if (!normalizedContent) {
    throw new Error('whisper.cpp generated an empty SRT file');
  }

  return `${normalizedContent}\n`;
}

/** 자막 worker 실패 코드를 DB에 저장 가능한 값으로 정규화한다. */
export function normalizeSubtitleWorkerFailureCode(
  errorCode: string | undefined,
): SubtitleWorkerFailureCode {
  if (
    errorCode === 'AUDIO_TOO_LARGE' ||
    errorCode === 'SOURCE_DOWNLOAD_FAILED' ||
    errorCode === 'TRANSCRIPTION_FAILED' ||
    errorCode === 'UPLOAD_FAILED'
  ) {
    return errorCode;
  }

  return 'TRANSCRIPTION_FAILED';
}

/** download/subtitle queued 후보 중 실제 FIFO로 처리할 job을 고른다. */
export function selectNextQueuedWorkerJob(input: {
  /** 가장 오래된 download 후보. */
  downloadJob: QueuedWorkerJobCandidate | null;
  /** 가장 오래된 subtitle 후보. */
  subtitleJob: QueuedWorkerJobCandidate | null;
}): (QueuedWorkerJobCandidate & { kind: QueuedWorkerJobKind }) | null {
  if (!input.downloadJob && !input.subtitleJob) {
    return null;
  }

  if (!input.downloadJob) {
    return { ...input.subtitleJob!, kind: 'subtitle' };
  }

  if (!input.subtitleJob) {
    return { ...input.downloadJob, kind: 'download' };
  }

  /** 생성 시각이 같을 때 정렬을 안정화하는 ID 비교값. */
  const idComparison = input.downloadJob.id.localeCompare(input.subtitleJob.id);
  /** download 후보가 FIFO상 먼저인지 여부. */
  const downloadFirst =
    input.downloadJob.createdAt < input.subtitleJob.createdAt ||
    (input.downloadJob.createdAt.getTime() ===
      input.subtitleJob.createdAt.getTime() &&
      idComparison <= 0);

  if (downloadFirst) {
    return { ...input.downloadJob, kind: 'download' };
  }

  return { ...input.subtitleJob, kind: 'subtitle' };
}

/** 브라우저가 R2 object를 inline 재생하지 않고 파일로 받도록 응답 disposition을 만든다. */
export function createContentDisposition(objectKey: string) {
  /** object key 마지막 segment를 다운로드 파일명으로 사용한다. */
  const fileName = objectKey.split('/').pop() || 'download';

  return `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** 자막 job status에 맞는 progress 값을 만든다. */
export function createSubtitleProgress(status: SubtitleJobStatus) {
  if (status === SubtitleJobStatus.queued) {
    return 10;
  }

  if (status === SubtitleJobStatus.extracting_audio) {
    return 40;
  }

  if (status === SubtitleJobStatus.transcribing) {
    return 70;
  }

  if (status === SubtitleJobStatus.completed) {
    return 100;
  }

  return null;
}

/** 자막 job status에 맞는 사용자 메시지를 만든다. */
export function createSubtitleMessage(
  status: SubtitleJobStatus,
  errorCode?: string | null,
) {
  if (status === SubtitleJobStatus.queued) {
    return '요청이 접수되어 대기 중입니다.';
  }

  if (status === SubtitleJobStatus.extracting_audio) {
    return '영상에서 음성을 추출하고 있습니다.';
  }

  if (status === SubtitleJobStatus.transcribing) {
    return '영어 자막을 생성하고 있습니다.';
  }

  if (status === SubtitleJobStatus.completed) {
    return '영어 SRT가 준비되었습니다.';
  }

  if (errorCode === 'AUDIO_TOO_LARGE') {
    return '추출된 음성 파일이 커서 현재 설정으로 처리할 수 없습니다.';
  }

  return '자막 생성에 실패했습니다. 다시 시도해 주세요.';
}

/** yt-dlp에서 읽은 원본 제목을 DB에 저장 가능한 값으로 정리한다. */
export function normalizeExtractedAssetTitle(title: unknown) {
  if (typeof title !== 'string') {
    return null;
  }

  /** 앞뒤 공백을 제거한 영상 제목. */
  const normalizedTitle = title.trim();

  return normalizedTitle || null;
}

/** 환경 숫자값을 기본값과 함께 읽는다. */
export function parseEnvNumber(value: string | undefined, fallback: number) {
  /** 숫자로 변환한 환경 변수 값. */
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallback;
}

/** yt-dlp metadata에서 실제 선택된 format 목록을 추출한다. */
function extractSelectedFormats(metadata: unknown): YtDlpFormatMetadata[] {
  if (!isObject(metadata)) {
    return [];
  }

  /** 분리 video/audio 선택 결과. */
  const requestedFormats = (metadata as YtDlpPreflightMetadata)
    .requested_formats;

  if (Array.isArray(requestedFormats)) {
    return requestedFormats.filter(isObject) as YtDlpFormatMetadata[];
  }

  return normalizeString((metadata as YtDlpPreflightMetadata).format_id)
    ? [metadata as YtDlpFormatMetadata]
    : [];
}

/** unknown 값이 object인지 확인한다. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 문자열 metadata 값을 정규화한다. */
function normalizeString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

/** 숫자 metadata 값을 정규화한다. */
function normalizeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 현재 시각 기준 보관 만료 시각을 계산한다. */
export function createExpiresAt(retentionDays: number, now = new Date()) {
  return new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);
}

/** worker heartbeat upsert 입력을 만든다. */
export function createWorkerHeartbeatUpsertArgs(now = new Date()) {
  return {
    create: {
      id: WORKER_HEARTBEAT_ID,
      lastSeenAt: now,
    },
    update: {
      lastSeenAt: now,
    },
    where: {
      id: WORKER_HEARTBEAT_ID,
    },
  };
}
