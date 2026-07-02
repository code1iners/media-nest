import { ExtractionJobStatus, ExtractionType } from '@mytube-extract/db';

/** 다운로드 작업 표시 상태. */
export type DownloadDisplayStatus = ExtractionJobStatus | 'expired';

/** 다운로드 실패 코드. */
export type DownloadErrorCode =
  | 'INVALID_URL'
  | 'EXTRACTION_FAILED'
  | 'VIDEO_TOO_LARGE'
  | 'YOUTUBE_AUTH_REQUIRED'
  | 'YOUTUBE_FORMAT_UNAVAILABLE'
  | 'UPLOAD_FAILED'
  | 'UNKNOWN';

/** 다운로드 품질 선택값. */
export type DownloadQuality = '128' | '192' | '320' | '360' | '720' | '1080';

/** 다운로드 상태 API 응답. */
export type DownloadResponse = {
  /** 다운로드 job ID. */
  jobId: string;
  /** DB에 저장된 실제 job 상태. */
  status: ExtractionJobStatus;
  /** asset 만료까지 반영한 화면 표시 상태. */
  displayStatus: DownloadDisplayStatus;
  /** 상태 기반 진행률. */
  progress: number | null;
  /** 추출 형식. */
  type: ExtractionType;
  /** 선택 품질. */
  quality: DownloadQuality;
  /** 요청 생성 시각. */
  createdAt: string;
  /** 화면에 표시할 보관 기간. */
  retentionDays: number;
  /** 완료된 파일 다운로드 path. */
  downloadUrl: string | null;
  /** 실패 코드. */
  errorCode: DownloadErrorCode | null;
  /** 사용자 표시 메시지. */
  message: string;
};

/** API가 R2 object를 attachment로 전달할 때 필요한 파일 정보. */
export type DownloadFile = {
  /** 파일 byte stream. */
  stream: NodeJS.ReadableStream;
  /** HTTP Content-Type. */
  contentType: string;
  /** HTTP Content-Disposition. */
  contentDisposition: string;
};

/** Prisma relation include를 적용한 job 조회 결과. */
export type JobWithAsset = {
  /** 다운로드 job ID. */
  id: string;
  /** 요청 URL. */
  url: string;
  /** YouTube video ID. */
  videoId: string;
  /** 추출 형식. */
  type: ExtractionType;
  /** 선택 품질. */
  quality: string;
  /** 실제 job 상태. */
  status: ExtractionJobStatus;
  /** 실패 코드. */
  errorCode: string | null;
  /** 생성 시각. */
  createdAt: Date;
  /** 연결된 asset. */
  asset: {
    /** asset row ID. */
    id: string;
    /** R2 object key. */
    objectKey: string;
    /** 원본 영상 제목. */
    title: string | null;
    /** asset 만료 시각. */
    expiresAt: Date;
  } | null;
};
