/** URL 원문 대신 로그에 남길 수 있는 host 중심 표현으로 줄인다. */
export function redactUrlForLog(url: string) {
  try {
    const parsedUrl = new URL(url);

    return `${parsedUrl.protocol}//${parsedUrl.host}`;
  } catch {
    return '[invalid-url]';
  }
}

/** server-only 진단 로그에 허용하는 최대 문자 수. */
const DIAGNOSTIC_TEXT_LIMIT = 1200;

/** downloader가 에러에 붙이는 server-only 진단 정보. */
type ErrorDiagnostic = {
  /** 진단 대상 도구 이름. */
  tool?: string;
  /** 프로세스 종료 코드. */
  exitCode?: number | null;
  /** 프로세스 종료 signal. */
  signal?: string | null;
  /** 프로세스 kill 여부. */
  killed?: boolean;
  /** stdout 마지막 일부. */
  stdoutTail?: string;
  /** stderr 마지막 일부. */
  stderrTail?: string;
};

/** server-only 진단 정보를 가진 에러 후보. */
type ErrorWithDiagnostic = Error & {
  /** client에는 노출하지 않는 운영 진단 정보. */
  diagnostic?: ErrorDiagnostic;
};

/** Error 객체에서 내부 경로나 upstream stderr를 client로 넘기지 않게 한다. */
export function createSafeErrorLog(error: unknown) {
  if (error instanceof Error) {
    return error.name || 'Error';
  }

  return 'UnknownError';
}

/** Error에 붙은 server-only 진단 정보를 안전하게 한 줄 로그로 만든다. */
export function createSafeDiagnosticLog(error: unknown) {
  if (!(error instanceof Error)) {
    return '';
  }

  /** downloader가 붙인 server-only 진단 정보. */
  const diagnostic = (error as ErrorWithDiagnostic).diagnostic;

  if (!diagnostic) {
    return '';
  }

  /** 로그에 포함할 key=value 조각. */
  const parts = [
    formatDiagnosticPart('tool', diagnostic.tool),
    formatDiagnosticPart('exitCode', diagnostic.exitCode),
    formatDiagnosticPart('signal', diagnostic.signal),
    formatDiagnosticPart('killed', diagnostic.killed),
    formatDiagnosticPart('stderrTail', diagnostic.stderrTail),
    formatDiagnosticPart('stdoutTail', diagnostic.stdoutTail),
  ].filter(Boolean);

  return parts.join(' ');
}

/** 진단 값 하나를 key=value 형태로 안전하게 줄인다. */
function formatDiagnosticPart(key: string, value: unknown) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  return `${key}=${sanitizeDiagnosticText(String(value))}`;
}

/** stderr/stdout tail에서 민감하거나 과한 내용을 줄인다. */
function sanitizeDiagnosticText(value: string) {
  return value
    .replace(/https?:\/\/[^\s'"]+/g, (url) => redactUrlForLog(url))
    .replace(/\/(?:tmp|var|app|home|Users|private)\/[^\s'"]+/g, '[local-path]')
    .replace(/([?&]?(?:token|key|secret|password)=)[^\s&'"]+/gi, '$1[redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, DIAGNOSTIC_TEXT_LIMIT);
}
