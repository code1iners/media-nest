import { SubtitleJobStatus } from '@mytube-extract/db';
import { Readable } from 'node:stream';
import type { z } from 'zod';
import type {
  abortSubtitleUploadSchema,
  completeSubtitleUploadSchema,
  createSubtitleUploadSchema,
} from './subtitles.schemas';

/** 자막 job 화면 표시 상태. */
export type SubtitleDisplayStatus = SubtitleJobStatus | 'expired';

/** 자막 job 실패 코드. */
export type SubtitleErrorCode =
  | 'AUDIO_TOO_LARGE'
  | 'INVALID_FILE'
  | 'SOURCE_DOWNLOAD_FAILED'
  | 'TRANSCRIPTION_FAILED'
  | 'UPLOAD_FAILED'
  | 'UNKNOWN';

/** 영어 SRT 생성에 사용할 Whisper 모델. */
export type SubtitleWhisperModel = 'base_en' | 'small_en';

/** direct R2 upload session 생성 요청. */
export type CreateSubtitleUploadInput = z.infer<
  typeof createSubtitleUploadSchema
>;

/** direct R2 upload session 생성 응답. */
export type SubtitleUploadResponse = {
  /** R2 multipart upload ID. */
  uploadId: string;
  /** complete/abort 요청 검증용 서명 token. */
  uploadToken: string;
  /** R2 source object key. */
  objectKey: string;
  /** browser가 나눠 올릴 part byte 크기. */
  partSizeBytes: number;
  /** presigned URL 만료 시각. */
  expiresAt: string;
  /** 각 part별 presigned upload URL. */
  parts: Array<{
    /** R2 multipart part 번호. */
    partNumber: number;
    /** browser가 PUT할 presigned URL. */
    uploadUrl: string;
  }>;
};

/** direct R2 multipart upload 완료 요청. */
export type CompleteSubtitleUploadInput = z.infer<
  typeof completeSubtitleUploadSchema
>;

/** direct R2 multipart upload 취소 요청. */
export type AbortSubtitleUploadInput = z.infer<
  typeof abortSubtitleUploadSchema
>;

/** 자막 job API 응답. */
export type SubtitleJobResponse = {
  /** 자막 job ID. */
  jobId: string;
  /** DB에 저장된 실제 job 상태. */
  status: SubtitleJobStatus;
  /** 만료까지 반영한 화면 표시 상태. */
  displayStatus: SubtitleDisplayStatus;
  /** 상태 기반 진행률. */
  progress: number | null;
  /** worker 처리 단계. */
  stage: SubtitleJobStatus;
  /** 업로드한 원본 파일명. */
  fileName: string;
  /** job 생성 시 선택한 Whisper 모델. */
  whisperModel: SubtitleWhisperModel;
  /** 요청 생성 시각. */
  createdAt: string;
  /** 화면에 표시할 보관 기간. */
  retentionDays: number;
  /** 완료된 SRT 다운로드 path. */
  downloadUrl: string | null;
  /** 실패 코드. */
  errorCode: SubtitleErrorCode | null;
  /** 사용자 표시 메시지. */
  message: string;
};

/** API가 SRT object를 attachment로 전달할 때 필요한 파일 정보. */
export type SubtitleFile = {
  /** 파일 byte stream. */
  stream: Readable;
  /** HTTP Content-Type. */
  contentType: string;
  /** HTTP Content-Disposition. */
  contentDisposition: string;
};

/**
 * @deprecated subtitle-legacy-multipart-upload
 * R2 direct multipart upload 안정화 후 제거한다.
 */
export type UploadedSubtitleFile = {
  /** 브라우저가 전달한 MIME type. */
  mimetype: string;
  /** 원본 파일명. */
  originalname: string;
  /** 임시 업로드 파일 경로. */
  path: string;
  /** 파일 byte 크기. */
  size: number;
};
