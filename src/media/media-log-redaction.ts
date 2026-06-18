/** URL 원문 대신 로그에 남길 수 있는 host 중심 표현으로 줄인다. */
export function redactUrlForLog(url: string) {
  try {
    const parsedUrl = new URL(url);

    return `${parsedUrl.protocol}//${parsedUrl.host}`;
  } catch {
    return '[invalid-url]';
  }
}

/** Error 객체에서 내부 경로나 upstream stderr를 client로 넘기지 않게 한다. */
export function createSafeErrorLog(error: unknown) {
  if (error instanceof Error) {
    return error.name || 'Error';
  }

  return 'UnknownError';
}
