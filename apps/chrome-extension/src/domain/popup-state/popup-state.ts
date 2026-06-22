/** Popup 상태 종류. */
export type PopupStatusKind =
  | 'missing-source-url'
  | 'invalid-source-url'
  | 'ready'
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

/** URL 입력 대기 상태. */
export const MISSING_SOURCE_URL_STATUS: PopupStatus = {
  kind: 'missing-source-url',
  message: '추출할 URL을 입력하세요.',
};

/** URL 형식 오류 상태. */
export const INVALID_SOURCE_URL_STATUS: PopupStatus = {
  kind: 'invalid-source-url',
  message: '지원하는 YouTube URL을 입력하세요.',
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

/** 원본 URL 준비 상태를 만든다. */
export function createReadyStatus(): PopupStatus {
  return {
    kind: 'ready',
    message: '추출할 URL이 준비되었습니다.',
  };
}

/** URL 형식 오류 상태를 만든다. */
export function createInvalidSourceUrlStatus(message: string): PopupStatus {
  return {
    kind: 'invalid-source-url',
    message,
  };
}

/** 실패 상태를 만든다. */
export function createDownloadFailedStatus(message: string): PopupStatus {
  return {
    kind: 'download-failed',
    message,
  };
}
