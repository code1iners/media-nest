import { z } from 'zod';

/** 영어 SRT 생성에 사용할 Whisper 모델 schema. */
export const subtitleWhisperModelSchema = z.enum(['base_en', 'small_en']);

/** direct R2 upload session 생성 요청 schema. */
export const createSubtitleUploadSchema = z.strictObject({
  /** 원본 파일 MIME type. */
  contentType: z.string().min(1),
  /** 원본 파일명. */
  fileName: z.string().min(1),
  /** 원본 파일 byte 크기. */
  sizeBytes: z.number().finite().positive(),
  /** 영어 SRT 생성에 사용할 Whisper 모델. */
  whisperModel: subtitleWhisperModelSchema.optional(),
});

/** direct R2 multipart upload part schema. */
const subtitleUploadedPartSchema = z.strictObject({
  /** R2 multipart part ETag. */
  etag: z.string().min(1),
  /** R2 multipart part 번호. */
  partNumber: z.number().int().min(1).max(10_000),
});

/** direct R2 multipart upload 완료 요청 schema. */
export const completeSubtitleUploadSchema = z.strictObject({
  /** R2 source object key. */
  objectKey: z.string().min(1),
  /** 업로드된 part 목록. */
  parts: z.array(subtitleUploadedPartSchema).min(1),
  /** R2 multipart upload ID. */
  uploadId: z.string().min(1),
  /** upload session 검증용 token. */
  uploadToken: z.string().min(1),
});

/** direct R2 multipart upload 취소 요청 schema. */
export const abortSubtitleUploadSchema = completeSubtitleUploadSchema.omit({
  parts: true,
});
