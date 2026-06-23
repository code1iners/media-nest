import { z } from 'zod';

/** MyTube Extract 다운로드 형식. */
export type DownloadMode = 'audio' | 'video';

/** 다운로드 입력 검증 결과. */
export type DownloadValidation =
  | {
      /** 검증 상태. */
      kind: 'empty';
      /** 사용자에게 보여줄 메시지. */
      message: string;
    }
  | {
      /** 검증 상태. */
      kind: 'invalid';
      /** 사용자에게 보여줄 메시지. */
      message: string;
    }
  | {
      /** 검증 상태. */
      kind: 'ready';
      /** 사용자에게 보여줄 메시지. */
      message: string;
    };

/** 다운로드 job 상태. */
export type DownloadJobStatus =
  | 'queued'
  | 'running'
  | 'ready'
  | 'failed'
  | 'canceled'
  | 'expired';

/** 다운로드 job 상태 응답. */
export type DownloadJobSnapshot = {
  /** 다운로드 job ID. */
  jobId: string;
  /** 다운로드 형식. */
  type: DownloadMode;
  /** 현재 다운로드 job 상태. */
  status: DownloadJobStatus;
  /** 생성 시각. */
  createdAt: string;
  /** 마지막 변경 시각. */
  updatedAt: string;
  /** 사용자에게 보여줄 상태 메시지. */
  message?: string;
};

/** 다운로드 job 생성 응답. */
export type CreateDownloadJobResponse = DownloadJobSnapshot & {
  /** 상태 조회 URL. */
  statusUrl: string;
  /** 파일 다운로드 URL. */
  fileUrl: string;
};

/** 다운로드 job 생성 요청. */
export type CreateDownloadJobRequest = {
  /** API 요청 URL. */
  url: string;
  /** API 요청 body. */
  body: {
    /** 다운로드 형식. */
    type: DownloadMode;
    /** 다운로드할 원본 URL. */
    url: string;
    /** 선택 파일명. */
    filename?: string;
    /** 선택 품질 값. */
    quality?: string;
  };
};

/** fetch 호환 함수. */
export type DownloadFetch = typeof fetch;

/** 다운로드 job polling 옵션. */
export type WaitForDownloadJobFileUrlOptions = {
  /** API base URL. */
  apiBaseUrl?: string;
  /** 테스트에서 대체할 fetch 함수. */
  fetcher?: DownloadFetch;
  /** polling 중단 신호. */
  signal?: AbortSignal;
  /** polling 간격. */
  intervalMs?: number;
  /** 상태 변경 콜백. */
  onStatus?: (snapshot: DownloadJobSnapshot) => void;
};

/** 로컬 MyTube Extract API 서버 주소. */
const LOCAL_API_BASE_URL = 'http://127.0.0.1:3030';

/** 운영 MyTube Extract API 서버 주소. */
const PRODUCTION_API_BASE_URL = 'https://media-nest.codeliners.cc';

/** 현재 실행 환경에 맞는 기본 MyTube Extract API 서버 주소. */
export const DEFAULT_API_BASE_URL = import.meta.env.DEV
  ? LOCAL_API_BASE_URL
  : PRODUCTION_API_BASE_URL;

/** API에서 거부하는 파일명 문자. */
const BLOCKED_FILENAME_PATTERN = /[\/\\\0\r\n]/;

/** 양의 정수 문자열 형식. */
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

/** 기본 다운로드 job polling 간격. */
const DEFAULT_POLL_INTERVAL_MS = 1500;

/** 다운로드 요청 입력값 schema. */
export const downloadDraftSchema = z.object({
  /** 사용자가 입력한 원본 미디어 URL. */
  sourceUrl: z
    .string()
    .trim()
    .min(1, 'URL을 입력하면 다운로드를 시작할 수 있습니다.')
    .refine(isUrl, '올바른 URL 형식이 아닙니다.')
    .refine(isHttpUrl, 'http 또는 https URL만 사용할 수 있습니다.'),
  /** 다운로드 형식. */
  mode: z.enum(['audio', 'video']),
  /** 선택 파일명. */
  filename: z
    .string()
    .trim()
    .refine(isSafeOptionalFilename, '파일명에는 경로 구분자나 제어 문자를 사용할 수 없습니다.'),
  /** 선택 품질 값. */
  quality: z
    .string()
    .trim()
    .refine(isOptionalPositiveInteger, '품질 값은 양의 정수만 사용할 수 있습니다.'),
});

/** 다운로드 요청 입력값. */
export type DownloadDraft = z.infer<typeof downloadDraftSchema>;

/** 앱 초기 입력값. */
export const INITIAL_DOWNLOAD_DRAFT: DownloadDraft = {
  sourceUrl: '',
  mode: 'audio',
  filename: '',
  quality: '',
};

/** 다운로드 입력값을 검증한다. */
export function validateDownloadDraft(draft: DownloadDraft): DownloadValidation {
  /** 앞뒤 공백을 제거한 원본 URL. */
  const sourceUrl = draft.sourceUrl.trim();

  if (!sourceUrl) {
    return {
      kind: 'empty',
      message: 'URL을 입력하면 다운로드를 시작할 수 있습니다.',
    };
  }

  /** 다운로드 입력 schema 검증 결과. */
  const parsedDraft = downloadDraftSchema.safeParse(draft);

  if (!parsedDraft.success) {
    /** 사용자에게 표시할 첫 번째 검증 메시지. */
    const message = parsedDraft.error.issues[0]?.message ?? '입력값을 확인해주세요.';

    return {
      kind: 'invalid',
      message,
    };
  }

  return {
    kind: 'ready',
    message: '다운로드를 시작할 수 있습니다.',
  };
}

/** MyTube Extract API 다운로드 job 생성 요청을 만든다. */
export function buildCreateDownloadJobRequest(
  draft: DownloadDraft,
  apiBaseUrl = DEFAULT_API_BASE_URL,
): CreateDownloadJobRequest {
  /** schema를 통과한 다운로드 입력값. */
  const parsedDraft = downloadDraftSchema.parse(draft);
  /** 다운로드 job 생성 요청 body. */
  const body: CreateDownloadJobRequest['body'] = {
    type: parsedDraft.mode,
    url: parsedDraft.sourceUrl,
  };

  if (parsedDraft.filename) {
    body.filename = parsedDraft.filename;
  }

  if (parsedDraft.quality) {
    body.quality = parsedDraft.quality;
  }

  return {
    body,
    url: buildApiUrl('/downloads', apiBaseUrl),
  };
}

/** 다운로드 job을 생성한다. */
export async function createDownloadJob(
  draft: DownloadDraft,
  options: { apiBaseUrl?: string; fetcher?: DownloadFetch; signal?: AbortSignal } = {},
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

  return (await response.json()) as CreateDownloadJobResponse;
}

/** 다운로드 job이 ready가 될 때까지 기다리고 파일 URL을 반환한다. */
export async function waitForDownloadJobFileUrl(
  job: CreateDownloadJobResponse,
  options: WaitForDownloadJobFileUrlOptions = {},
) {
  /** API 요청에 사용할 fetch 함수. */
  const fetcher = options.fetcher ?? fetch;
  /** polling 간격. */
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  if (job.status === 'ready') {
    return buildApiUrl(job.fileUrl, options.apiBaseUrl);
  }

  while (true) {
    await wait(intervalMs, options.signal);

    /** 다운로드 job 상태 응답. */
    const response = await fetcher(buildApiUrl(job.statusUrl, options.apiBaseUrl), {
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error('Download job status failed.');
    }

    /** 현재 다운로드 job 상태. */
    const snapshot = (await response.json()) as DownloadJobSnapshot;

    options.onStatus?.(snapshot);

    if (snapshot.status === 'ready') {
      return buildApiUrl(job.fileUrl, options.apiBaseUrl);
    }

    if (['failed', 'canceled', 'expired'].includes(snapshot.status)) {
      throw new Error(snapshot.message ?? 'Download job failed.');
    }
  }
}

/** 다운로드 job을 취소한다. */
export async function cancelDownloadJob(
  job: DownloadJobSnapshot,
  options: { apiBaseUrl?: string; fetcher?: DownloadFetch } = {},
) {
  /** API 요청에 사용할 fetch 함수. */
  const fetcher = options.fetcher ?? fetch;
  /** 다운로드 job 취소 응답. */
  const response = await fetcher(buildApiUrl(`/downloads/${job.jobId}`, options.apiBaseUrl), {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Download job cancel failed.');
  }

  return (await response.json()) as DownloadJobSnapshot;
}

/** API base URL을 .env 입력값 기준으로 정규화한다. */
export function normalizeApiBaseUrl(apiBaseUrl = DEFAULT_API_BASE_URL) {
  /** .env에서 읽은 API base URL. */
  const trimmedApiBaseUrl = apiBaseUrl.trim() || DEFAULT_API_BASE_URL;
  /** URL 객체로 검증한 API base URL. */
  const parsedApiBaseUrl = new URL(trimmedApiBaseUrl);

  if (parsedApiBaseUrl.protocol !== 'http:' && parsedApiBaseUrl.protocol !== 'https:') {
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

/** URL 형식인지 확인한다. */
function isUrl(value: string) {
  try {
    new URL(value);

    return true;
  } catch {
    return false;
  }
}

/** http/https URL인지 확인한다. */
function isHttpUrl(value: string) {
  try {
    /** URL 파싱 결과. */
    const parsedUrl = new URL(value);

    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

/** API가 허용하는 optional filename인지 확인한다. */
function isSafeOptionalFilename(filename: string) {
  if (!filename) {
    return true;
  }

  return (
    filename !== '.' &&
    filename !== '..' &&
    !BLOCKED_FILENAME_PATTERN.test(filename)
  );
}

/** 비어 있거나 양의 정수인 품질 값인지 확인한다. */
function isOptionalPositiveInteger(quality: string) {
  return !quality || POSITIVE_INTEGER_PATTERN.test(quality);
}
