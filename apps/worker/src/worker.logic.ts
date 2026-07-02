import { ExtractionType } from '@mytube-extract/db';

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

/** 브라우저가 R2 object를 inline 재생하지 않고 파일로 받도록 응답 disposition을 만든다. */
export function createContentDisposition(objectKey: string) {
  /** object key 마지막 segment를 다운로드 파일명으로 사용한다. */
  const fileName = objectKey.split('/').pop() || 'download';

  return `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
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
