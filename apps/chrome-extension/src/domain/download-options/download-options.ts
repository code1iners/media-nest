import { DEFAULT_API_BASE_URL } from '../../shared/constants';

/** 지원하는 다운로드 모드. */
export type DownloadMode = 'audio' | 'video';

/** Popup form에서 관리하는 다운로드 옵션. */
export type DownloadOptions = {
  /** API base URL. */
  apiBaseUrl: string;
  /** 오디오 bitrate option. */
  bitrate: string;
  /** 다운로드 파일명 option. */
  filename: string;
  /** 다운로드 모드. */
  mode: DownloadMode;
  /** 비디오 resolution option. */
  resolution: string;
};

/** 저장소에서 읽은 다운로드 옵션. */
export type StoredDownloadOptions = Partial<DownloadOptions>;

/** 기본 popup 다운로드 옵션. */
export const DEFAULT_DOWNLOAD_OPTIONS: DownloadOptions = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  bitrate: '',
  filename: '',
  mode: 'audio',
  resolution: '',
};

/** 선택 가능한 다운로드 모드 목록. */
const DOWNLOAD_MODES = new Set<DownloadMode>(['audio', 'video']);

/** 저장된 옵션과 기본 옵션을 호환성 있게 병합한다. */
export function mergeStoredDownloadOptions(
  storedOptions: StoredDownloadOptions,
): DownloadOptions {
  /** 저장된 다운로드 모드. */
  const storedMode = storedOptions.mode;

  return {
    ...DEFAULT_DOWNLOAD_OPTIONS,
    ...storedOptions,
    mode: isDownloadMode(storedMode) ? storedMode : DEFAULT_DOWNLOAD_OPTIONS.mode,
  };
}

/** API base URL을 fetch/download에 사용할 수 있는 형태로 정규화한다. */
export function normalizeApiBaseUrl(apiBaseUrl: string | undefined): string {
  /** 사용자가 입력한 API base URL. */
  const trimmedBaseUrl = apiBaseUrl?.trim() ?? '';

  if (!trimmedBaseUrl) {
    throw new Error('API base URL is required');
  }

  /** URL 객체로 검증한 API base URL. */
  const url = new URL(trimmedBaseUrl);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('API base URL must use http or https');
  }

  return url.toString().replace(/\/$/, '');
}

/** 다운로드 모드 값인지 확인한다. */
export function isDownloadMode(mode: unknown): mode is DownloadMode {
  return mode === 'audio' || mode === 'video';
}

/** 지원하지 않는 다운로드 모드면 오류를 던진다. */
export function assertDownloadMode(mode: unknown): asserts mode is DownloadMode {
  if (!DOWNLOAD_MODES.has(mode as DownloadMode)) {
    throw new Error('Unsupported download mode');
  }
}
