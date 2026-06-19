/** Popup 상태 종류. */
export type PopupStatusKind =
  | 'checking-tab'
  | 'ready'
  | 'unsupported-page'
  | 'missing-api-url'
  | 'checking-server'
  | 'download-started'
  | 'download-failed';

/** Popup 상태 메시지. */
export type PopupStatus = {
  /** 상태 종류. */
  kind: PopupStatusKind;
  /** 사용자에게 표시할 상태 메시지. */
  message: string;
};

/** 현재 탭 확인 상태. */
export const CHECKING_TAB_STATUS: PopupStatus = {
  kind: 'checking-tab',
  message: 'Checking current tab...',
};

/** 지원하지 않는 페이지 상태. */
export const UNSUPPORTED_PAGE_STATUS: PopupStatus = {
  kind: 'unsupported-page',
  message: 'Open a YouTube watch page to download media.',
};

/** API base URL 오류 상태. */
export const MISSING_API_URL_STATUS: PopupStatus = {
  kind: 'missing-api-url',
  message: 'Enter a valid API base URL.',
};

/** 서버 확인 상태. */
export const CHECKING_SERVER_STATUS: PopupStatus = {
  kind: 'checking-server',
  message: 'Checking server...',
};

/** 다운로드 시작 상태. */
export const DOWNLOAD_STARTED_STATUS: PopupStatus = {
  kind: 'download-started',
  message: 'Download started.',
};

/** YouTube video 준비 상태를 만든다. */
export function createReadyStatus(videoId: string): PopupStatus {
  return {
    kind: 'ready',
    message: `Ready for video ${videoId}.`,
  };
}

/** 실패 상태를 만든다. */
export function createDownloadFailedStatus(message: string): PopupStatus {
  return {
    kind: 'download-failed',
    message,
  };
}
