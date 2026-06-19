/** 기본 Media Nest API 서버 주소. */
export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3030';

/** Chrome storage에 저장하는 popup option key 목록. */
export const STORAGE_KEYS = [
  'apiBaseUrl',
  'filename',
  'bitrate',
  'resolution',
  'mode',
] as const;
