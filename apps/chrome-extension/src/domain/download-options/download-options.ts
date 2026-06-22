import { DEFAULT_API_BASE_URL } from '../../shared/constants';

/** 지원하는 다운로드 모드. */
export type DownloadMode = 'audio' | 'video';

/** Popup form에서 관리하는 다운로드 옵션. */
export type DownloadOptions = {
  /** 고정 Media Nest API base URL. */
  apiBaseUrl: string;
  /** 오디오 bitrate option. */
  bitrate: string;
  /** 다운로드 파일명 option. */
  filename: string;
  /** 다운로드 모드. */
  mode: DownloadMode;
  /** 비디오 resolution option. */
  resolution: string;
  /** 추출할 원본 URL. */
  sourceUrl: string;
};

/** 저장소에서 읽은 다운로드 옵션. */
export type StoredDownloadOptions = Partial<
  Pick<DownloadOptions, 'bitrate' | 'filename' | 'mode' | 'resolution'>
>;

/** 기본 popup 다운로드 옵션. */
export const DEFAULT_DOWNLOAD_OPTIONS: DownloadOptions = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  bitrate: '',
  filename: '',
  mode: 'audio',
  resolution: '',
  sourceUrl: '',
};

/** 선택 가능한 다운로드 모드 목록. */
const DOWNLOAD_MODES = new Set<DownloadMode>(['audio', 'video']);

/** 저장된 옵션과 기본 옵션을 호환성 있게 병합한다. */
export function mergeStoredDownloadOptions(
  storedOptions: StoredDownloadOptions & Record<string, unknown>,
): DownloadOptions {
  /** 저장된 다운로드 모드. */
  const storedMode = storedOptions.mode;

  return {
    ...DEFAULT_DOWNLOAD_OPTIONS,
    bitrate: typeof storedOptions.bitrate === 'string' ? storedOptions.bitrate : '',
    filename: typeof storedOptions.filename === 'string' ? storedOptions.filename : '',
    resolution: typeof storedOptions.resolution === 'string' ? storedOptions.resolution : '',
    mode: isDownloadMode(storedMode) ? storedMode : DEFAULT_DOWNLOAD_OPTIONS.mode,
  };
}

/** API base URL을 fetch/download에 사용할 수 있는 형태로 정규화한다. */
export function normalizeApiBaseUrl(apiBaseUrl: string | undefined): string {
  /** 런타임에 전달된 API base URL. */
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

/** YouTube watch URL video ID 형식. */
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** 허용하는 YouTube host 목록. */
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com']);

/** YouTube short URL host 목록. */
const YOUTUBE_SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be']);

/** 원본 YouTube URL을 API에 전달 가능한 형태로 정규화한다. */
export function normalizeSourceUrl(sourceUrl: string | undefined): string {
  /** 사용자가 입력한 source URL. */
  const trimmedSourceUrl = sourceUrl?.trim() ?? '';

  if (!trimmedSourceUrl) {
    throw new Error('A valid source URL is required');
  }

  /** URL 객체로 검증한 source URL. */
  let url: URL;

  try {
    url = new URL(trimmedSourceUrl);
  } catch {
    throw new Error('A valid source URL is required');
  }

  /** 원본 URL에서 추출한 YouTube video ID. */
  const videoId = getYoutubeVideoId(url);

  if (!videoId) {
    throw new Error('YouTube watch URL is required');
  }

  if (isYoutubeWatchUrl(url)) {
    return url.toString();
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** YouTube watch URL인지 확인한다. */
function isYoutubeWatchUrl(url: URL): boolean {
  /** YouTube video ID query 값. */
  const videoId = url.searchParams.get('v') ?? '';

  return (
    ['http:', 'https:'].includes(url.protocol) &&
    YOUTUBE_HOSTS.has(url.hostname) &&
    url.pathname === '/watch' &&
    YOUTUBE_VIDEO_ID_PATTERN.test(videoId)
  );
}

/** 지원 URL에서 YouTube video ID를 추출한다. */
function getYoutubeVideoId(url: URL): string {
  if (!['http:', 'https:'].includes(url.protocol)) {
    return '';
  }

  if (YOUTUBE_HOSTS.has(url.hostname) && url.pathname === '/watch') {
    /** YouTube watch URL video ID. */
    const videoId = url.searchParams.get('v') ?? '';

    return YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : '';
  }

  if (YOUTUBE_SHORT_HOSTS.has(url.hostname)) {
    /** youtu.be path video ID. */
    const videoId = url.pathname.split('/').filter(Boolean)[0] ?? '';

    return YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : '';
  }

  if (YOUTUBE_HOSTS.has(url.hostname) && url.pathname.startsWith('/shorts/')) {
    /** YouTube Shorts path video ID. */
    const videoId = url.pathname.split('/').filter(Boolean)[1] ?? '';

    return YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : '';
  }

  return '';
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
