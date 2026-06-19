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
  message: '현재 영상을 확인하고 있습니다.',
};

/** 지원하지 않는 페이지 상태. */
export const UNSUPPORTED_PAGE_STATUS: PopupStatus = {
  kind: 'unsupported-page',
  message: 'YouTube watch 페이지에서 다시 열어주세요.',
};

/** API base URL 오류 상태. */
export const MISSING_API_URL_STATUS: PopupStatus = {
  kind: 'missing-api-url',
  message: '올바른 API 서버 주소를 입력하세요.',
};

/** 서버 확인 상태. */
export const CHECKING_SERVER_STATUS: PopupStatus = {
  kind: 'checking-server',
  message: 'API 서버를 확인하고 있습니다.',
};

/** 다운로드 시작 상태. */
export const DOWNLOAD_STARTED_STATUS: PopupStatus = {
  kind: 'download-started',
  message: '추출 요청을 시작했습니다.',
};

/** YouTube video 준비 상태를 만든다. */
export function createReadyStatus(videoId: string): PopupStatus {
  return {
    kind: 'ready',
    message: `현재 영상 감지 완료: ${videoId}`,
  };
}

/** 실패 상태를 만든다. */
export function createDownloadFailedStatus(message: string): PopupStatus {
  return {
    kind: 'download-failed',
    message,
  };
}
