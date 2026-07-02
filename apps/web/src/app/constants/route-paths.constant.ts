/** 앱 route 절대 경로. */
export const ROUTE_PATHS = {
  root: '/',
  subtitles: '/subtitles',
  video: '/video',
} as const;

/** React Router route segment. */
export const ROUTE_SEGMENTS = {
  subtitles: 'subtitles',
  video: 'video',
} as const;
