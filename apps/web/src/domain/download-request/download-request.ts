import { z } from 'zod';

/** Media Nest 다운로드 형식. */
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

/** 로컬 Media Nest API 서버 주소. */
const LOCAL_API_BASE_URL = 'http://127.0.0.1:3030';

/** 운영 Media Nest API 서버 주소. */
const PRODUCTION_API_BASE_URL = 'https://media-nest.codeliners.cc';

/** 현재 실행 환경에 맞는 기본 Media Nest API 서버 주소. */
export const DEFAULT_API_BASE_URL = import.meta.env.DEV
  ? LOCAL_API_BASE_URL
  : PRODUCTION_API_BASE_URL;

/** API에서 거부하는 파일명 문자. */
const BLOCKED_FILENAME_PATTERN = /[\/\\\0\r\n]/;

/** 양의 정수 문자열 형식. */
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

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

/** Media Nest API 다운로드 URL을 만든다. */
export function buildDownloadUrl(draft: DownloadDraft, apiBaseUrl = DEFAULT_API_BASE_URL) {
  /** schema를 통과한 다운로드 입력값. */
  const parsedDraft = downloadDraftSchema.parse(draft);
  /** 정규화된 API server base URL. */
  const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
  /** API 다운로드 URL. */
  const downloadUrl = new URL(`${normalizedApiBaseUrl}/${parsedDraft.mode}`);

  downloadUrl.searchParams.set('url', parsedDraft.sourceUrl);

  if (parsedDraft.filename) {
    downloadUrl.searchParams.set('filename', parsedDraft.filename);
  }

  if (parsedDraft.quality) {
    downloadUrl.searchParams.set(
      parsedDraft.mode === 'audio' ? 'bitrate' : 'resolution',
      parsedDraft.quality,
    );
  }

  return downloadUrl.toString();
}

/** API 응답 header와 입력값으로 브라우저 저장 파일명을 결정한다. */
export function resolveDownloadFilename(
  draft: DownloadDraft,
  contentDisposition: string | null,
) {
  /** API가 내려준 attachment 파일명. */
  const headerFilename = parseContentDispositionFilename(contentDisposition);

  if (headerFilename) {
    return headerFilename;
  }

  /** header가 없을 때 사용할 local fallback 파일명. */
  const fallbackName = draft.filename.trim() || `media-nest-${draft.mode}`;
  /** 다운로드 형식별 파일 확장자. */
  const extension = draft.mode === 'audio' ? 'mp3' : 'mp4';

  return `${fallbackName}.${extension}`;
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

/** Content-Disposition header에서 RFC 5987 filename* 값을 추출한다. */
function parseContentDispositionFilename(contentDisposition: string | null) {
  if (!contentDisposition) {
    return '';
  }

  /** 현재 API의 attachment filename* header 값. */
  const encodedFilename = contentDisposition.match(/filename\*\s*=\s*([^;]+)/i)?.[1]?.trim();

  if (!encodedFilename) {
    return '';
  }

  /** 따옴표로 감싼 header value도 허용한다. */
  const unquotedFilename = encodedFilename.replace(/^"|"$/g, '');
  /** RFC 5987 charset/lang prefix 뒤의 encoded filename. */
  const [, filename = unquotedFilename] = unquotedFilename.split("''");

  try {
    return decodeURIComponent(filename);
  } catch {
    return '';
  }
}
