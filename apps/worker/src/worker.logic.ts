import { ExtractionType } from '@mytube-extract/db';

/** 단일 worker heartbeat row ID. */
export const WORKER_HEARTBEAT_ID = 'default';

/** worker에서 처리하는 품질 key. */
export type WorkerQuality =
  | 'default'
  | '128'
  | '192'
  | '320'
  | '360'
  | '720'
  | '1080';

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
    return quality === 'default'
      ? 'bestaudio/best'
      : `bestaudio[abr<=${quality}]/best`;
  }

  return quality === 'default'
    ? 'bestvideo+bestaudio/best'
    : `bestvideo[height<=${quality}]+bestaudio/best`;
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

/** 환경 숫자값을 기본값과 함께 읽는다. */
export function parseEnvNumber(value: string | undefined, fallback: number) {
  /** 숫자로 변환한 환경 변수 값. */
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallback;
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
