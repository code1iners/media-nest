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
  { label: '최고 품질', value: 'default' },
  { label: '128', value: '128' },
  { label: '192', value: '192' },
  { label: '320', value: '320' },
] as const;

/** video 품질 선택지. */
export const VIDEO_QUALITY_OPTIONS = [
  { label: '최고 품질', value: 'default' },
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

/** terminal 상태인지 확인한다. */
export function isTerminalStatus(status: DownloadDisplayStatus) {
  return status === 'completed' || status === 'failed' || status === 'expired';
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
