import {
  type DownloadDraft,
  type DownloadResponse,
  downloadDraftSchema,
  isTerminalStatus,
} from '../domain/download-request/download-request';
import {
  type SubtitleWhisperModel,
  type SubtitleJobResponse,
  isSubtitleTerminalStatus,
} from '../domain/subtitle-request/subtitle-request';

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

/** 자막 job polling 옵션. */
export type WaitForSubtitleJobOptions = {
  /** API base URL. */
  apiBaseUrl?: string;
  /** 테스트에서 대체할 fetch 함수. */
  fetcher?: MyTubeExtractFetch;
  /** polling 중단 신호. */
  signal?: AbortSignal;
  /** polling 간격. */
  intervalMs?: number;
  /** 상태 변경 콜백. */
  onStatus?: (snapshot: SubtitleJobResponse) => void;
};

/** direct R2 upload session 생성 응답. */
export type SubtitleUploadResponse = {
  /** presigned URL 만료 시각. */
  expiresAt: string;
  /** R2 source object key. */
  objectKey: string;
  /** browser가 나눠 올릴 part byte 크기. */
  partSizeBytes: number;
  /** 각 part별 presigned upload URL. */
  parts: Array<{
    /** R2 multipart part 번호. */
    partNumber: number;
    /** browser가 PUT할 presigned URL. */
    uploadUrl: string;
  }>;
  /** R2 multipart upload ID. */
  uploadId: string;
  /** complete/abort 요청 검증용 서명 token. */
  uploadToken: string;
};

/** R2 multipart upload 완료에 필요한 part 정보. */
export type SubtitleUploadedPart = {
  /** R2 multipart part ETag. */
  etag: string;
  /** R2 multipart part 번호. */
  partNumber: number;
};

/** direct upload 진행률. */
export type SubtitleUploadProgress = {
  /** 현재 완료된 byte 수. */
  uploadedBytes: number;
  /** 전체 byte 수. */
  totalBytes: number;
  /** 완료된 비율. */
  percent: number;
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
const LOCAL_API_BASE_URL = 'http://127.0.0.1:5011';

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

/** 자막 원본 영상 업로드 용량 초과 오류. */
export class SubtitleUploadTooLargeError extends Error {
  constructor(requestPath: string) {
    super('Subtitle upload is too large.');
    this.name = 'SubtitleUploadTooLargeError';
    this.detail = {
      code: 'SUBTITLE_UPLOAD_TOO_LARGE',
      guidance: '업로드 가능한 크기보다 큰 영상 파일입니다.',
      location: '자막 원본 업로드',
      requestPath,
      responseStatus: 413,
    };
  }

  /** 사용자에게 열람 가능한 오류 상세 정보. */
  detail: UserVisibleErrorDetail;
}

/** R2 direct upload 실패 오류. */
export class SubtitleDirectUploadFailedError extends Error {
  constructor(input: {
    /** 사용자 안내 문구. */
    guidance: string;
    /** 오류 발생 위치. */
    location: string;
    /** 응답 상태 코드. */
    responseStatus?: number;
  }) {
    super('Subtitle direct upload failed.');
    this.name = 'SubtitleDirectUploadFailedError';
    this.detail = {
      code: 'SUBTITLE_DIRECT_UPLOAD_FAILED',
      guidance: input.guidance,
      location: input.location,
      requestPath: 'R2 presigned upload URL',
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

/** R2 direct upload session을 생성한다. */
export async function createSubtitleUpload(
  file: File,
  whisperModel: SubtitleWhisperModel,
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
  /** direct upload session 생성 응답. */
  const response = await fetcher(
    buildApiUrl('/subtitles/uploads', options.apiBaseUrl),
    {
      body: JSON.stringify({
        contentType: file.type,
        fileName: file.name,
        sizeBytes: file.size,
        whisperModel,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: options.signal,
    },
  );

  if (!response.ok) {
    if (response.status === 413) {
      throw new SubtitleUploadTooLargeError('/subtitles/uploads');
    }

    throw new Error('Subtitle upload session create failed.');
  }

  return (await response.json()) as SubtitleUploadResponse;
}

/** 파일을 R2 multipart presigned URL로 직접 업로드한다. */
export async function uploadSubtitleFileParts(
  file: File,
  upload: SubtitleUploadResponse,
  options: {
    /** 테스트에서 대체할 fetch 함수. */
    fetcher?: MyTubeExtractFetch;
    /** 업로드 진행률 콜백. */
    onProgress?: (progress: SubtitleUploadProgress) => void;
    /** 요청 중단 신호. */
    signal?: AbortSignal;
  } = {},
) {
  /** R2 PUT 요청에 사용할 fetch 함수. */
  const fetcher = options.fetcher ?? fetch;
  /** part 업로드 결과. */
  const uploadedParts: SubtitleUploadedPart[] = [];
  /** 다음에 업로드할 part index. */
  let nextPartIndex = 0;
  /** 완료된 byte 수. */
  let uploadedBytes = 0;
  /** 브라우저 동시 업로드 수. */
  const concurrency = Math.min(3, upload.parts.length);

  /** 단일 part 업로드 worker. */
  async function uploadNextPart() {
    while (nextPartIndex < upload.parts.length) {
      /** 현재 worker가 담당할 part index. */
      const partIndex = nextPartIndex;
      nextPartIndex += 1;

      /** 현재 업로드할 part. */
      const part = upload.parts[partIndex];
      /** part 시작 byte offset. */
      const start = partIndex * upload.partSizeBytes;
      /** part 끝 byte offset. */
      const end = Math.min(start + upload.partSizeBytes, file.size);
      /** 업로드할 file slice. */
      const body = file.slice(start, end);
      /** 업로드된 part ETag. */
      const etag = await uploadSubtitlePart(fetcher, part.uploadUrl, body, {
        signal: options.signal,
      });

      uploadedParts.push({ etag, partNumber: part.partNumber });
      uploadedBytes += body.size;
      options.onProgress?.({
        percent: Math.min(100, Math.round((uploadedBytes / file.size) * 100)),
        totalBytes: file.size,
        uploadedBytes,
      });
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => uploadNextPart()),
  );

  return uploadedParts.sort(
    (first, second) => first.partNumber - second.partNumber,
  );
}

/** R2 direct upload를 완료하고 자막 job을 생성한다. */
export async function completeSubtitleUpload(
  upload: SubtitleUploadResponse,
  parts: SubtitleUploadedPart[],
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
  /** direct upload 완료 응답. */
  const response = await fetcher(
    buildApiUrl('/subtitles/uploads/complete', options.apiBaseUrl),
    {
      body: JSON.stringify({
        objectKey: upload.objectKey,
        parts,
        uploadId: upload.uploadId,
        uploadToken: upload.uploadToken,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: options.signal,
    },
  );

  if (!response.ok) {
    throw new Error('Subtitle upload complete failed.');
  }

  return (await response.json()) as SubtitleJobResponse;
}

/** R2 direct upload를 취소한다. */
export async function abortSubtitleUpload(
  upload: SubtitleUploadResponse,
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

  await fetcher(buildApiUrl('/subtitles/uploads/abort', options.apiBaseUrl), {
    body: JSON.stringify({
      objectKey: upload.objectKey,
      uploadId: upload.uploadId,
      uploadToken: upload.uploadToken,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: options.signal,
  });
}

/**
 * @deprecated subtitle-legacy-multipart-upload
 * R2 direct multipart upload 안정화 후 제거한다.
 */
export async function createSubtitleJob(
  file: File,
  whisperModel: SubtitleWhisperModel,
  options: {
    /** API base URL. */
    apiBaseUrl?: string;
    /** 테스트에서 대체할 fetch 함수. */
    fetcher?: MyTubeExtractFetch;
    /** 요청 중단 신호. */
    signal?: AbortSignal;
  } = {},
) {
  /** multipart 요청 body. */
  const body = new FormData();
  /** API 요청에 사용할 fetch 함수. */
  const fetcher = options.fetcher ?? fetch;

  body.append('file', file);
  body.append('whisperModel', whisperModel);

  /** 자막 job 생성 응답. */
  const response = await fetcher(
    buildApiUrl('/subtitles/jobs', options.apiBaseUrl),
    {
      body,
      method: 'POST',
      signal: options.signal,
    },
  );

  if (!response.ok) {
    if (response.status === 413) {
      throw new SubtitleUploadTooLargeError('/subtitles/jobs');
    }

    throw new Error('Subtitle job create failed.');
  }

  return (await response.json()) as SubtitleJobResponse;
}

/** R2 presigned URL 하나에 part를 업로드한다. */
async function uploadSubtitlePart(
  fetcher: MyTubeExtractFetch,
  uploadUrl: string,
  body: Blob,
  options: {
    /** 요청 중단 신호. */
    signal?: AbortSignal;
  },
) {
  try {
    /** R2 part 업로드 응답. */
    const response = await fetcher(uploadUrl, {
      body,
      method: 'PUT',
      signal: options.signal,
    });

    if (!response.ok) {
      throw new SubtitleDirectUploadFailedError({
        guidance: 'R2 part 업로드가 실패했습니다. 잠시 후 다시 시도해 주세요.',
        location: 'R2 part 업로드',
        responseStatus: response.status,
      });
    }

    /** multipart complete에 필요한 ETag 응답 헤더. */
    const etag = response.headers.get('ETag');

    if (!etag) {
      throw new SubtitleDirectUploadFailedError({
        guidance: 'R2 CORS 설정에서 ETag 응답 헤더 노출이 필요합니다.',
        location: 'R2 part 업로드 응답 확인',
      });
    }

    return etag;
  } catch (error) {
    if (error instanceof DOMException) {
      throw error;
    }

    if (error instanceof SubtitleDirectUploadFailedError) {
      throw error;
    }

    throw new SubtitleDirectUploadFailedError({
      guidance:
        'R2 업로드 요청이 차단되었습니다. R2 CORS에서 PUT preflight와 ETag 응답 헤더 노출을 확인해 주세요.',
      location: 'R2 part 업로드',
    });
  }
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

/** 자막 job 상태를 조회한다. */
export async function getSubtitleJob(
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
  /** 자막 job 상태 응답. */
  const response = await fetcher(
    buildApiUrl(`/subtitles/jobs/${jobId}`, options.apiBaseUrl),
    {
      signal: options.signal,
    },
  );

  if (!response.ok) {
    throw new Error('Subtitle job status failed.');
  }

  return (await response.json()) as SubtitleJobResponse;
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

/** 자막 job이 terminal 상태가 될 때까지 polling한다. */
export async function waitForSubtitleJob(
  job: SubtitleJobResponse,
  options: WaitForSubtitleJobOptions = {},
) {
  /** polling 간격. */
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  /** 현재 상태 snapshot. */
  let snapshot = job;

  while (!isSubtitleTerminalStatus(snapshot.displayStatus)) {
    await wait(intervalMs, options.signal);
    snapshot = await getSubtitleJob(snapshot.jobId, options);
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
export function assertWorkerAvailable(
  health: WorkerHealthResponse | undefined,
) {
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
