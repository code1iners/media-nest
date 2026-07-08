import { SubtitleJobStatus } from '@mytube-extract/db';
import { SubtitleJobResponse, SubtitleWhisperModel } from './subtitles.types';

/** 자막 asset 기본 보관 기간. */
export const DEFAULT_SUBTITLE_RETENTION_DAYS = 7;

/** 기본 업로드 최대 크기. */
export const DEFAULT_SUBTITLE_UPLOAD_MAX_BYTES = 500 * 1024 * 1024;

/** 지원하는 로컬 영상 확장자 목록. */
const SUPPORTED_VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm'] as const;

/** 지원하는 로컬 영상 MIME type 목록. */
const SUPPORTED_VIDEO_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

/** SRT attachment MIME type. */
export const SRT_CONTENT_TYPE = 'application/x-subrip; charset=utf-8';

/** 기본 Whisper 모델. */
export const DEFAULT_SUBTITLE_WHISPER_MODEL: SubtitleWhisperModel = 'base_en';

/** 자막 job status에 맞는 progress 값을 만든다. */
export function createSubtitleProgress(status: SubtitleJobResponse['stage']) {
  if (status === SubtitleJobStatus.queued) {
    return 10;
  }

  if (status === SubtitleJobStatus.extracting_audio) {
    return 40;
  }

  if (status === SubtitleJobStatus.transcribing) {
    return 70;
  }

  if (status === SubtitleJobStatus.completed) {
    return 100;
  }

  return null;
}

/** 상태별 사용자 표시 메시지. */
export function createSubtitleStatusMessage(
  status: SubtitleJobResponse['displayStatus'],
  errorCode: string | null,
) {
  if (status === SubtitleJobStatus.queued) {
    return '요청이 접수되어 대기 중입니다.';
  }

  if (status === SubtitleJobStatus.extracting_audio) {
    return '영상에서 음성을 추출하고 있습니다.';
  }

  if (status === SubtitleJobStatus.transcribing) {
    return '영어 자막을 생성하고 있습니다.';
  }

  if (status === SubtitleJobStatus.completed) {
    return '영어 SRT가 준비되었습니다.';
  }

  if (status === SubtitleJobStatus.failed) {
    return createSubtitleFailureMessage(errorCode);
  }

  return '보관 기간이 지났습니다. 다시 생성해 주세요.';
}

/** 업로드 가능한 영상 파일인지 확인한다. */
export function isSupportedSubtitleVideoFile(input: {
  /** 파일 MIME type. */
  contentType: string;
  /** 원본 파일명. */
  fileName: string;
}) {
  /** 원본 파일 확장자. */
  const extension = getFileExtension(input.fileName);

  return (
    SUPPORTED_VIDEO_EXTENSIONS.includes(
      extension as (typeof SUPPORTED_VIDEO_EXTENSIONS)[number],
    ) &&
    SUPPORTED_VIDEO_CONTENT_TYPES.includes(
      input.contentType as (typeof SUPPORTED_VIDEO_CONTENT_TYPES)[number],
    )
  );
}

/** 요청값을 지원하는 Whisper 모델로 정리한다. */
export function parseSubtitleWhisperModel(
  value: unknown,
): SubtitleWhisperModel | null {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_SUBTITLE_WHISPER_MODEL;
  }

  if (value === 'base_en' || value === 'small_en') {
    return value;
  }

  return null;
}

/** 자막 source R2 object key를 만든다. */
export function createSubtitleSourceObjectKey(jobId: string, fileName: string) {
  /** 업로드 파일 확장자. */
  const extension = getFileExtension(fileName) || 'mp4';

  return `subtitles/${jobId}/source.${extension}`;
}

/** direct upload 중인 자막 source R2 object key를 만든다. */
export function createSubtitleUploadSourceObjectKey(
  uploadSessionId: string,
  fileName: string,
) {
  /** 업로드 파일 확장자. */
  const extension = getFileExtension(fileName) || 'mp4';

  return `subtitles/uploads/${uploadSessionId}/source.${extension}`;
}

/** 영어 SRT R2 object key를 만든다. */
export function createSubtitleResultObjectKey(jobId: string) {
  return `subtitles/${jobId}/english.srt`;
}

/** 원본 파일명에서 SRT 다운로드 파일명을 만든다. */
export function createSubtitleDownloadFileName(originalFileName: string) {
  /** 확장자를 제외한 안전한 원본 이름. */
  const baseName =
    sanitizeFileBaseName(originalFileName.replace(/\.[^.]+$/, '')) ||
    'subtitle';

  return `${baseName}.en.srt`;
}

/** 브라우저가 inline 표시하지 않도록 attachment disposition을 만든다. */
export function createAttachmentDisposition(fileName: string) {
  /** filename fallback은 quoted-string을 깨는 문자를 제거한 ASCII 안전값. */
  const asciiFallback = createAsciiFallbackFileName(fileName);
  /** RFC 5987 filename* 파라미터용 UTF-8 percent-encoded 파일명. */
  const encodedFileName = encodeRFC5987ValueChars(fileName);

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFileName}`;
}

/** 환경 숫자값을 기본값과 함께 읽는다. */
export function parsePositiveNumber(
  value: string | undefined,
  fallback: number,
) {
  /** 숫자로 변환한 환경 변수 값. */
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallback;
}

/** 현재 시각 기준 보관 만료 시각을 계산한다. */
export function createExpiresAt(retentionDays: number, now = new Date()) {
  return new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);
}

/** 실패 코드별 사용자 안내 문구를 만든다. */
function createSubtitleFailureMessage(errorCode: string | null) {
  if (errorCode === 'INVALID_FILE') {
    return '지원하는 영상 파일을 선택해 주세요.';
  }

  if (errorCode === 'AUDIO_TOO_LARGE') {
    return '추출된 음성 파일이 커서 현재 설정으로 처리할 수 없습니다.';
  }

  if (errorCode === 'TRANSCRIPTION_FAILED') {
    return '영어 SRT 생성 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  }

  if (errorCode === 'SOURCE_DOWNLOAD_FAILED') {
    return '업로드한 영상을 읽는 중 문제가 발생했습니다.';
  }

  if (errorCode === 'UPLOAD_FAILED') {
    return '파일 업로드 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  }

  return '자막 생성에 실패했습니다. 다시 시도해 주세요.';
}

/** 파일명 확장자를 소문자로 반환한다. */
function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

/** 파일명 base를 OS/HTTP에 위험하지 않게 정리한다. */
function sanitizeFileBaseName(fileName: string) {
  return fileName
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 120)
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '');
}

/** Content-Disposition filename* 값에서 허용되지 않는 문자를 추가로 percent-encode한다. */
function encodeRFC5987ValueChars(value: string) {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** legacy filename 파라미터용 ASCII fallback을 만든다. */
function createAsciiFallbackFileName(fileName: string) {
  /** 확장자를 제외한 파일명 후보. */
  const extension = fileName.match(/\.[A-Za-z0-9]+$/)?.[0] ?? '';
  /** ASCII로 표현 가능한 base filename. */
  const baseName = fileName
    .slice(0, extension ? -extension.length : undefined)
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\;]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[. _]+|[. _]+$/g, '')
    .trim();

  return `${baseName || 'subtitle'}${extension}`;
}
