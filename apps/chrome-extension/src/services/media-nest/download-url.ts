import {
  type DownloadOptions,
  assertDownloadMode,
  normalizeApiBaseUrl,
} from '../../domain/download-options/download-options';
import { isYoutubeVideoId } from '../../domain/youtube/youtube-url';

/** 다운로드 URL 생성 option. */
export type BuildDownloadUrlOptions = DownloadOptions & {
  /** 요청 대상 YouTube video ID. */
  videoId: string;
};

/** 선택된 모드와 옵션을 Media Nest 다운로드 URL로 변환한다. */
export function buildDownloadUrl(options: BuildDownloadUrlOptions): string {
  assertDownloadMode(options.mode);

  if (!isYoutubeVideoId(options.videoId)) {
    throw new Error('A valid YouTube video ID is required');
  }

  /** 정규화된 API base URL. */
  const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
  /** 다운로드 URL의 선택 query 값. */
  const searchParams = new URLSearchParams();

  appendOptionalQuery(searchParams, 'filename', options.filename);

  if (options.mode === 'audio') {
    appendOptionalQuery(searchParams, 'bitrate', options.bitrate);
  }

  if (options.mode === 'video') {
    appendOptionalQuery(searchParams, 'resolution', options.resolution);
  }

  /** optional query string. */
  const queryString = searchParams.toString();
  /** Media Nest path endpoint 기반 다운로드 URL. */
  const downloadUrl = `${apiBaseUrl}/${options.mode}/${encodeURIComponent(options.videoId)}`;

  return queryString ? `${downloadUrl}?${queryString}` : downloadUrl;
}

/** API base URL에서 health check URL을 만든다. */
export function buildHealthUrl(apiBaseUrl: string): string {
  /** 정규화된 API base URL. */
  const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);

  return `${normalizedApiBaseUrl}/health`;
}

/** 비어 있지 않은 옵션만 query string에 추가한다. */
function appendOptionalQuery(
  searchParams: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  /** 사용자가 입력한 optional query 값. */
  const normalizedValue = value?.trim() ?? '';

  if (normalizedValue) {
    searchParams.set(key, normalizedValue);
  }
}
