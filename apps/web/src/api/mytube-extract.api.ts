import {
  type DownloadDraft,
  type DownloadResponse,
  downloadDraftSchema,
  isTerminalStatus,
} from '../domain/download-request/download-request';

/** fetch 호환 함수. */
export type MyTubeExtractFetch = typeof fetch;

/** 사용자에게 열람 가능한 오류 상세 정보. */
export type UserVisibleErrorDetail = {
  /** 오류 코드. */
  code: string;
  /** 오류 발생 위치. */
  location: string;
  /** 사용자 안내 문구. */
  guidance: string;
  /** 요청 경로. */
  requestPath?: string;
  /** 응답 상태 코드. */
  responseStatus?: number;
  /** 민감값을 제거한 응답 내용. */
  responseBody?: string;
};

/** worker health API 응답. */
export type WorkerHealthResponse = {
  /** API 프로세스 응답 가능 여부. */
  ok: boolean;
  /** worker 처리 가능 상태. */
  worker: {
    /** 최근 heartbeat 기준 worker 사용 가능 여부. */
    available: boolean;
  };
};

/** 다운로드 job polling 옵션. */
export type WaitForDownloadJobOptions = {
  /** API base URL. */
  apiBaseUrl?: string;
  /** 테스트에서 대체할 fetch 함수. */
  fetcher?: MyTubeExtractFetch;
  /** polling 중단 신호. */
  signal?: AbortSignal;
  /** polling 간격. */
  intervalMs?: number;
  /** 상태 변경 콜백. */
  onStatus?: (snapshot: DownloadResponse) => void;
};

/** 다운로드 job 생성 요청. */
export type CreateDownloadJobRequest = {
  /** API 요청 URL. */
  url: string;
  /** API 요청 body. */
  body: {
    /** 다운로드 형식. */
    type: DownloadDraft['mode'];
    /** 다운로드할 YouTube URL. */
    url: string;
    /** 선택 품질 값. */
    quality: DownloadDraft['quality'];
  };
};

/** 로컬 MyTube Extract API 서버 주소. */
const LOCAL_API_BASE_URL = 'http://127.0.0.1:3030';

/** 운영 MyTube Extract API 서버 주소. */
const PRODUCTION_API_BASE_URL = 'https://media-nest.codeliners.cc';

/** 기본 다운로드 job polling 간격. */
const DEFAULT_POLL_INTERVAL_MS = 2500;

/** 기본 API 서버 주소. */
export const DEFAULT_API_BASE_URL = import.meta.env.DEV
  ? LOCAL_API_BASE_URL
  : PRODUCTION_API_BASE_URL;

/** worker 미가용 오류. */
export class WorkerUnavailableError extends Error {
  constructor() {
    super('Worker is unavailable.');
    this.name = 'WorkerUnavailableError';
  }

  /** 사용자에게 열람 가능한 오류 상세 정보. */
  detail: UserVisibleErrorDetail = {
    code: 'WORKER_UNAVAILABLE',
    guidance: '추출 서버가 작업을 받을 수 없는 상태입니다.',
    location: '서비스 상태 확인',
    requestPath: '/health',
  };
}

/** worker health 응답 형식 오류. */
export class ServiceStatusFormatError extends Error {
  constructor(input: {
    /** 응답 상태 코드. */
    responseStatus: number;
    /** 민감값을 제거하기 전 응답 내용. */
    responseBody: string;
  }) {
    super('Service status response format is invalid.');
    this.name = 'ServiceStatusFormatError';
    this.detail = {
      code: 'SERVICE_STATUS_FORMAT_ERROR',
      guidance: '서비스 상태 정보가 예상과 달라 요청을 진행할 수 없습니다.',
      location: '서비스 상태 확인',
      requestPath: '/health',
      responseBody: sanitizeErrorText(input.responseBody),
      responseStatus: input.responseStatus,
    };
  }

  /** 사용자에게 열람 가능한 오류 상세 정보. */
  detail: UserVisibleErrorDetail;
}

/** worker health를 조회한다. */
export async function getWorkerHealth(
  options: {
    /** API base URL. */
    apiBaseUrl?: string;
    /** 테스트에서 대체할 fetch 함수. */
    fetcher?: MyTubeExtractFetch;
    /** 요청 중단 신호. */
    signal?: AbortSignal;
  } = {},
) {
  /** API 요청에 사용할 fetch 함수. */
  const fetcher = options.fetcher ?? fetch;
  /** worker health 응답. */
  const response = await fetcher(buildApiUrl('/health', options.apiBaseUrl), {
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error('Worker health check failed.');
  }

  /** 응답 형식 검증 전 원문. */
  const responseBody = await response.text();
  /** JSON으로 파싱한 worker health 응답 후보. */
  let health: unknown;

  try {
    health = JSON.parse(responseBody);
  } catch {
    throw new ServiceStatusFormatError({
      responseBody,
      responseStatus: response.status,
    });
  }

  if (!isWorkerHealthResponse(health)) {
    throw new ServiceStatusFormatError({
      responseBody,
      responseStatus: response.status,
    });
  }

  return health;
}

/** MyTube Extract API 다운로드 job 생성 요청을 만든다. */
export function buildCreateDownloadJobRequest(
  draft: DownloadDraft,
  apiBaseUrl = DEFAULT_API_BASE_URL,
): CreateDownloadJobRequest {
  /** schema를 통과한 다운로드 입력값. */
  const parsedDraft = downloadDraftSchema.parse(draft);

  return {
    body: {
      quality: parsedDraft.quality,
      type: parsedDraft.mode,
      url: parsedDraft.sourceUrl.trim(),
    },
    url: buildApiUrl('/downloads', apiBaseUrl),
  };
}

/** 다운로드 job을 생성한다. */
export async function createDownloadJob(
  draft: DownloadDraft,
  options: {
    /** API base URL. */
    apiBaseUrl?: string;
    /** 테스트에서 대체할 fetch 함수. */
    fetcher?: MyTubeExtractFetch;
    /** 요청 중단 신호. */
    signal?: AbortSignal;
  } = {},
) {
  /** 다운로드 job 생성 요청. */
  const request = buildCreateDownloadJobRequest(draft, options.apiBaseUrl);
  /** API 요청에 사용할 fetch 함수. */
  const fetcher = options.fetcher ?? fetch;
  /** 다운로드 job 생성 응답. */
  const response = await fetcher(request.url, {
    body: JSON.stringify(request.body),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error('Download job create failed.');
  }

  return (await response.json()) as DownloadResponse;
}

/** 다운로드 job 상태를 조회한다. */
export async function getDownloadJob(
  jobId: string,
  options: {
    /** API base URL. */
    apiBaseUrl?: string;
    /** 테스트에서 대체할 fetch 함수. */
    fetcher?: MyTubeExtractFetch;
    /** 요청 중단 신호. */
    signal?: AbortSignal;
  } = {},
) {
  /** API 요청에 사용할 fetch 함수. */
  const fetcher = options.fetcher ?? fetch;
  /** 다운로드 job 상태 응답. */
  const response = await fetcher(
    buildApiUrl(`/downloads/${jobId}`, options.apiBaseUrl),
    {
      signal: options.signal,
    },
  );

  if (!response.ok) {
    throw new Error('Download job status failed.');
  }

  return (await response.json()) as DownloadResponse;
}

/** 다운로드 job이 terminal 상태가 될 때까지 polling한다. */
export async function waitForDownloadJob(
  job: DownloadResponse,
  options: WaitForDownloadJobOptions = {},
) {
  /** polling 간격. */
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  /** 현재 상태 snapshot. */
  let snapshot = job;

  while (!isTerminalStatus(snapshot.displayStatus)) {
    await wait(intervalMs, options.signal);
    snapshot = await getDownloadJob(snapshot.jobId, options);
    options.onStatus?.(snapshot);
  }

  return snapshot;
}

/** API base URL을 .env 입력값 기준으로 정규화한다. */
export function normalizeApiBaseUrl(apiBaseUrl = DEFAULT_API_BASE_URL) {
  /** .env에서 읽은 API base URL. */
  const trimmedApiBaseUrl = apiBaseUrl.trim() || DEFAULT_API_BASE_URL;
  /** URL 객체로 검증한 API base URL. */
  const parsedApiBaseUrl = new URL(trimmedApiBaseUrl);

  if (
    parsedApiBaseUrl.protocol !== 'http:' &&
    parsedApiBaseUrl.protocol !== 'https:'
  ) {
    throw new Error('API base URL must use http or https.');
  }

  parsedApiBaseUrl.search = '';
  parsedApiBaseUrl.hash = '';

  return parsedApiBaseUrl.toString().replace(/\/$/, '');
}

/** API base URL의 path prefix를 보존해 endpoint URL을 만든다. */
export function buildApiUrl(path: string, apiBaseUrl = DEFAULT_API_BASE_URL) {
  /** 정규화된 API server base URL. */
  const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
  /** 앞쪽 slash를 제거한 endpoint path. */
  const normalizedPath = path.replace(/^\/+/, '');

  return `${normalizedApiBaseUrl}/${normalizedPath}`;
}

/** worker 사용 가능 여부를 검증한다. */
export function assertWorkerAvailable(health: WorkerHealthResponse | undefined) {
  if (health?.worker?.available !== true) {
    throw new WorkerUnavailableError();
  }
}

/** worker health API 응답 형식을 확인한다. */
function isWorkerHealthResponse(value: unknown): value is WorkerHealthResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  /** worker health 응답 후보. */
  const health = value as Partial<WorkerHealthResponse>;

  return (
    typeof health.ok === 'boolean' &&
    !!health.worker &&
    typeof health.worker.available === 'boolean'
  );
}

/** 상세 원인에 표시할 텍스트에서 민감값과 과도한 길이를 줄인다. */
function sanitizeErrorText(value: string) {
  return value
    .replace(
      /"([^"]*(?:token|secret|password|key)[^"]*)"\s*:\s*"[^"]*"/gi,
      '"$1":"[redacted]"',
    )
    .slice(0, 1000);
}

/** polling 간격만큼 대기한다. */
function wait(intervalMs: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise<void>((resolve, reject) => {
    /** polling timer 식별자. */
    const timeout = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, intervalMs);
    /** abort 시 timer를 정리하고 promise를 종료한다. */
    const handleAbort = () => {
      globalThis.clearTimeout(timeout);
      reject(createAbortError());
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

/** 브라우저/테스트 환경 공통 AbortError를 만든다. */
function createAbortError() {
  return new DOMException('Aborted', 'AbortError');
}
