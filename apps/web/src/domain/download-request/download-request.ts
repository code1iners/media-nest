import { z } from 'zod';

/** MyTube Extract 다운로드 형식. */
export type DownloadMode = 'audio' | 'video';

/** 다운로드 품질 key. */
export type DownloadQuality =
  | 'default'
  | '128'
  | '192'
  | '320'
  | '360'
  | '720'
  | '1080';

/** 다운로드 job 상태. */
export type DownloadJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

/** 화면 표시 상태. */
export type DownloadDisplayStatus = DownloadJobStatus | 'expired';

/** 다운로드 실패 코드. */
export type DownloadErrorCode =
  | 'INVALID_URL'
  | 'EXTRACTION_FAILED'
  | 'UPLOAD_FAILED'
  | 'UNKNOWN';

/** 다운로드 입력 검증 결과. */
export type DownloadValidation =
  | {
      /** 검증 상태. */
      kind: 'empty';
      /** 사용자 표시 메시지. */
      message: string;
    }
  | {
      /** 검증 상태. */
      kind: 'invalid';
      /** 사용자 표시 메시지. */
      message: string;
    }
  | {
      /** 검증 상태. */
      kind: 'ready';
      /** 사용자 표시 메시지. */
      message: string;
    };

/** 다운로드 API 응답. */
export type DownloadResponse = {
  /** 다운로드 job ID. */
  jobId: string;
  /** 실제 job 상태. */
  status: DownloadJobStatus;
  /** asset 만료까지 반영한 표시 상태. */
  displayStatus: DownloadDisplayStatus;
  /** 상태 기반 진행률. */
  progress: number | null;
  /** 추출 형식. */
  type: DownloadMode;
  /** 선택 품질. */
  quality: DownloadQuality;
  /** 요청 시작 시각. */
  createdAt: string;
  /** 보관 기간 일수. */
  retentionDays: number;
  /** 완료된 파일 다운로드 URL. */
  downloadUrl: string | null;
  /** 실패 코드. */
  errorCode: DownloadErrorCode | null;
  /** 사용자 표시 메시지. */
  message: string;
};

/** fetch 호환 함수. */
export type DownloadFetch = typeof fetch;

/** 다운로드 job polling 옵션. */
export type WaitForDownloadJobOptions = {
  /** API base URL. */
  apiBaseUrl?: string;
  /** 테스트에서 대체할 fetch 함수. */
  fetcher?: DownloadFetch;
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
    type: DownloadMode;
    /** 다운로드할 YouTube URL. */
    url: string;
    /** 선택 품질 값. */
    quality: DownloadQuality;
  };
};

/** 로컬 MyTube Extract API 서버 주소. */
const LOCAL_API_BASE_URL = 'http://127.0.0.1:3030';

/** 운영 MyTube Extract API 서버 주소. */
const PRODUCTION_API_BASE_URL = 'https://media-nest.codeliners.cc';

/** 기본 API 서버 주소. */
export const DEFAULT_API_BASE_URL = import.meta.env.DEV
  ? LOCAL_API_BASE_URL
  : PRODUCTION_API_BASE_URL;

/** 기본 다운로드 job polling 간격. */
const DEFAULT_POLL_INTERVAL_MS = 2500;

/** YouTube video ID 형식. */
const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

/** 다운로드 요청 입력값 schema. */
export const downloadDraftSchema = z.object({
  /** 사용자가 입력한 YouTube URL. */
  sourceUrl: z
    .string()
    .trim()
    .min(1, 'YouTube URL을 입력해 주세요.')
    .refine(isSupportedYoutubeUrl, '지원하는 YouTube URL을 입력해 주세요.'),
  /** 다운로드 형식. */
  mode: z.enum(['audio', 'video']),
  /** 선택 품질 값. */
  quality: z.enum(['default', '128', '192', '320', '360', '720', '1080']),
});

/** 다운로드 요청 입력값. */
export type DownloadDraft = z.infer<typeof downloadDraftSchema>;

/** 앱 초기 입력값. */
export const INITIAL_DOWNLOAD_DRAFT: DownloadDraft = {
  mode: 'audio',
  quality: 'default',
  sourceUrl: '',
};

/** audio 품질 선택지. */
export const AUDIO_QUALITY_OPTIONS = [
  { label: '기본값', value: 'default' },
  { label: '128', value: '128' },
  { label: '192', value: '192' },
  { label: '320', value: '320' },
] as const;

/** video 품질 선택지. */
export const VIDEO_QUALITY_OPTIONS = [
  { label: '기본값', value: 'default' },
  { label: '360', value: '360' },
  { label: '720', value: '720' },
  { label: '1080', value: '1080' },
] as const;

/** 다운로드 입력값을 검증한다. */
export function validateDownloadDraft(
  draft: DownloadDraft,
): DownloadValidation {
  /** 앞뒤 공백을 제거한 원본 URL. */
  const sourceUrl = draft.sourceUrl.trim();

  if (!sourceUrl) {
    return {
      kind: 'empty',
      message: 'YouTube URL을 입력해 주세요.',
    };
  }

  /** 다운로드 입력 schema 검증 결과. */
  const parsedDraft = downloadDraftSchema.safeParse(draft);

  if (!parsedDraft.success) {
    /** 첫 번째 검증 메시지. */
    const message =
      parsedDraft.error.issues[0]?.message ?? '입력값을 확인해 주세요.';

    return {
      kind: 'invalid',
      message,
    };
  }

  return {
    kind: 'ready',
    message: '추출 요청을 보낼 수 있습니다.',
  };
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
    fetcher?: DownloadFetch;
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
    fetcher?: DownloadFetch;
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

/** terminal 상태인지 확인한다. */
export function isTerminalStatus(status: DownloadDisplayStatus) {
  return status === 'completed' || status === 'failed' || status === 'expired';
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

/** 지원 YouTube URL인지 확인한다. */
function isSupportedYoutubeUrl(value: string) {
  try {
    /** URL parser를 통과한 사용자 입력 URL. */
    const url = new URL(value);
    /** host 정규화 값. */
    const host = url.hostname.toLowerCase();

    if (host === 'youtu.be') {
      return YOUTUBE_VIDEO_ID_PATTERN.test(
        url.pathname.split('/').filter(Boolean)[0] ?? '',
      );
    }

    if (host === 'youtube.com' || host === 'www.youtube.com') {
      if (url.pathname === '/watch') {
        return YOUTUBE_VIDEO_ID_PATTERN.test(url.searchParams.get('v') ?? '');
      }

      if (url.pathname.startsWith('/shorts/')) {
        return YOUTUBE_VIDEO_ID_PATTERN.test(
          url.pathname.split('/').filter(Boolean)[1] ?? '',
        );
      }
    }
  } catch {
    return false;
  }

  return false;
}
