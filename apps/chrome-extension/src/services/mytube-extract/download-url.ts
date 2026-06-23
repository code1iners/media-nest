import {
  type DownloadOptions,
  assertDownloadMode,
  normalizeApiBaseUrl,
  normalizeSourceUrl,
} from '../../domain/download-options/download-options';

/** 다운로드 URL 생성 option. */
export type BuildDownloadUrlOptions = DownloadOptions;

/** 선택된 모드와 옵션을 MyTube Extract 다운로드 URL로 변환한다. */
export function buildDownloadUrl(options: BuildDownloadUrlOptions): string {
  assertDownloadMode(options.mode);

  /** 정규화된 API base URL. */
  const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
  /** 정규화된 원본 URL. */
  const sourceUrl = normalizeSourceUrl(options.sourceUrl);
  /** 다운로드 URL의 선택 query 값. */
  const searchParams = new URLSearchParams();

  searchParams.set('url', sourceUrl);
  appendOptionalQuery(searchParams, 'filename', options.filename);

  if (options.mode === 'audio') {
    appendOptionalQuery(searchParams, 'bitrate', options.bitrate);
  }

  if (options.mode === 'video') {
    appendOptionalQuery(searchParams, 'resolution', options.resolution);
  }

  /** MyTube Extract URL endpoint 기반 다운로드 URL. */
  return `${apiBaseUrl}/${options.mode}?${searchParams.toString()}`;
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
