/** 운영 MyTube Extract API 서버 주소. */
export const PRODUCTION_API_BASE_URL = 'https://media-nest.codeliners.cc';

/** 로컬 MyTube Extract API 서버 주소. */
export const LOCAL_API_BASE_URL = 'http://127.0.0.1:3030';

/** WXT runtime에서 노출하는 MyTube Extract import.meta shape. */
type MyTubeExtractImportMeta = ImportMeta & {
  /** WXT/Vite 환경 변수 map. */
  readonly env: {
    /** 환경별 MyTube Extract API 서버 주소. */
    readonly WXT_MYTUBE_EXTRACT_API_BASE_URL?: string;
    /** 이전 Media Nest API 서버 주소 fallback. */
    readonly WXT_MEDIA_NEST_API_BASE_URL?: string;
  };
};

/** WXT build/dev 환경에서 주입된 API 서버 주소. */
const configuredApiBaseUrl =
  (import.meta as MyTubeExtractImportMeta).env.WXT_MYTUBE_EXTRACT_API_BASE_URL ??
  (import.meta as MyTubeExtractImportMeta).env.WXT_MEDIA_NEST_API_BASE_URL;

/** 기본 MyTube Extract API 서버 주소. */
export const DEFAULT_API_BASE_URL = resolveDefaultApiBaseUrl(configuredApiBaseUrl);

/** Chrome storage에 저장하는 popup option key 목록. */
export const STORAGE_KEYS = ['filename', 'bitrate', 'resolution', 'mode'] as const;

/** 환경 변수 값이 없으면 운영 API 주소를 기본값으로 사용한다. */
export function resolveDefaultApiBaseUrl(apiBaseUrl: string | undefined): string {
  /** 환경 변수에서 읽은 API 서버 주소. */
  const trimmedApiBaseUrl = apiBaseUrl?.trim() ?? '';

  return trimmedApiBaseUrl || PRODUCTION_API_BASE_URL;
}
