import {
  BadRequestException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubtitleJobStatus } from '@mytube-extract/db';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { R2StorageService } from '../downloads/r2-storage.service';
import {
  createAttachmentDisposition,
  createExpiresAt,
  createSubtitleDownloadFileName,
  createSubtitleProgress,
  createSubtitleSourceObjectKey,
  createSubtitleStatusMessage,
  createSubtitleUploadSourceObjectKey,
  DEFAULT_SUBTITLE_RETENTION_DAYS,
  DEFAULT_SUBTITLE_UPLOAD_MAX_BYTES,
  isSupportedSubtitleVideoFile,
  parseSubtitleWhisperModel,
  parsePositiveNumber,
  SRT_CONTENT_TYPE,
} from './subtitles.util';
import {
  AbortSubtitleUploadInput,
  CompleteSubtitleUploadInput,
  CreateSubtitleUploadInput,
  SubtitleFile,
  SubtitleJobResponse,
  SubtitleUploadResponse,
  SubtitleWhisperModel,
  UploadedSubtitleFile,
} from './subtitles.types';

/** 브라우저 direct upload용 multipart part 크기. */
const SUBTITLE_UPLOAD_PART_SIZE_BYTES = 64 * 1024 * 1024;
/** R2 presigned URL 유효 시간. */
const SUBTITLE_UPLOAD_URL_EXPIRES_SECONDS = 30 * 60;
/** S3 compatible multipart upload 최대 part 수. */
const SUBTITLE_UPLOAD_MAX_PARTS = 10_000;

/** 서명 token에 넣는 direct upload session payload. */
type SubtitleUploadTokenPayload = {
  /** 원본 파일 MIME type. */
  contentType: string;
  /** token 만료 epoch millis. */
  expiresAt: number;
  /** 원본 파일명. */
  fileName: string;
  /** R2 source object key. */
  objectKey: string;
  /** 원본 파일 byte 크기. */
  sizeBytes: number;
  /** R2 multipart upload ID. */
  uploadId: string;
  /** 선택한 Whisper 모델. */
  whisperModel: SubtitleWhisperModel;
};

/** 자막 추출 API service. */
@Injectable()
export class SubtitlesService {
  private readonly logger = new Logger(SubtitlesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly r2StorageService: R2StorageService,
  ) {}

  /**
   * @deprecated subtitle-legacy-multipart-upload
   * R2 direct multipart upload 안정화 후 제거한다.
   */
  async create(file: UploadedSubtitleFile | undefined, whisperModel?: unknown) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    /** R2 source object key. */
    let sourceObjectKey = '';
    /** R2 업로드가 완료되어 보상 삭제가 필요한지 여부. */
    let sourceUploaded = false;

    try {
      this.assertValidUpload(file);

      /** 요청에서 선택한 Whisper 모델. */
      const parsedWhisperModel = parseSubtitleWhisperModel(whisperModel);

      if (!parsedWhisperModel) {
        throw new BadRequestException(
          'whisperModel must be base_en or small_en',
        );
      }

      /** 새 subtitle job ID. */
      const jobId = randomUUID();
      sourceObjectKey = createSubtitleSourceObjectKey(jobId, file.originalname);

      await this.r2StorageService.putObject({
        body: createReadStream(file.path),
        contentDisposition: createAttachmentDisposition(file.originalname),
        contentType: file.mimetype,
        objectKey: sourceObjectKey,
      });
      sourceUploaded = true;

      /** 생성된 자막 job. */
      const job = await this.prisma.subtitleJob.create({
        data: {
          expiresAt: createExpiresAt(this.getRetentionDays()),
          id: jobId,
          originalFileName: file.originalname,
          sourceContentType: file.mimetype,
          sourceObjectKey,
          sourceSizeBytes: file.size,
          whisperModel: parsedWhisperModel,
        },
      });

      return this.toResponse(job);
    } catch (error) {
      if (sourceUploaded) {
        await this.r2StorageService
          .deleteObject(sourceObjectKey)
          .catch((deleteError) => {
            this.logger.error(
              `Subtitle source compensation failed: ${sourceObjectKey} ${
                deleteError instanceof Error
                  ? deleteError.message
                  : String(deleteError)
              }`,
            );
          });
      }

      throw error;
    } finally {
      await rm(file.path, { force: true }).catch((error) => {
        this.logger.warn(
          `Temporary subtitle upload cleanup failed: ${file.path} ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }
  }

  /** 브라우저가 R2로 직접 올릴 multipart upload session을 만든다. */
  async createUpload(
    input: CreateSubtitleUploadInput,
  ): Promise<SubtitleUploadResponse> {
    this.assertValidUploadMetadata(input);

    /** 요청에서 선택한 Whisper 모델. */
    const parsedWhisperModel = parseSubtitleWhisperModel(input.whisperModel);

    if (!parsedWhisperModel) {
      throw new BadRequestException('whisperModel must be base_en or small_en');
    }

    /** R2 direct upload session ID. */
    const uploadSessionId = randomUUID();
    /** R2 source object key. */
    const objectKey = createSubtitleUploadSourceObjectKey(
      uploadSessionId,
      input.fileName,
    );
    /** presigned URL 만료 시각. */
    const expiresAt = new Date(
      Date.now() + SUBTITLE_UPLOAD_URL_EXPIRES_SECONDS * 1000,
    );
    /** browser upload part 수. */
    const partCount = Math.ceil(
      input.sizeBytes / SUBTITLE_UPLOAD_PART_SIZE_BYTES,
    );

    if (partCount > SUBTITLE_UPLOAD_MAX_PARTS) {
      throw new BadRequestException('file has too many multipart upload parts');
    }

    /** R2 multipart upload ID. */
    const uploadId = await this.r2StorageService.createMultipartUpload({
      contentDisposition: createAttachmentDisposition(input.fileName),
      contentType: input.contentType,
      objectKey,
    });
    /** upload session payload. */
    const tokenPayload: SubtitleUploadTokenPayload = {
      contentType: input.contentType,
      expiresAt: expiresAt.getTime(),
      fileName: input.fileName,
      objectKey,
      sizeBytes: input.sizeBytes,
      uploadId,
      whisperModel: parsedWhisperModel,
    };
    /** 각 part 업로드 URL. */
    const parts = await Promise.all(
      Array.from({ length: partCount }, async (_, index) => {
        /** S3 multipart part 번호는 1부터 시작한다. */
        const partNumber = index + 1;

        return {
          partNumber,
          uploadUrl: await this.r2StorageService.createMultipartUploadPartUrl({
            expiresInSeconds: SUBTITLE_UPLOAD_URL_EXPIRES_SECONDS,
            objectKey,
            partNumber,
            uploadId,
          }),
        };
      }),
    );

    return {
      expiresAt: expiresAt.toISOString(),
      objectKey,
      partSizeBytes: SUBTITLE_UPLOAD_PART_SIZE_BYTES,
      parts,
      uploadId,
      uploadToken: this.signUploadToken(tokenPayload),
    };
  }

  /** R2 direct upload 완료 후 자막 job을 생성한다. */
  async completeUpload(input: CompleteSubtitleUploadInput) {
    /** 검증된 upload session payload. */
    const payload = this.verifyUploadToken(input.uploadToken);

    this.assertUploadTargetMatches(payload, input);
    /** R2 multipart complete에 전달할 정렬된 part 목록. */
    const parts = this.normalizeUploadParts(input.parts);
    /** multipart complete 이후 생성된 object key. */
    let completedObjectKey = '';

    await this.r2StorageService.completeMultipartUpload({
      objectKey: input.objectKey,
      parts,
      uploadId: input.uploadId,
    });
    completedObjectKey = input.objectKey;

    try {
      /** 완료된 R2 object metadata. */
      const metadata = await this.r2StorageService.getObjectMetadata(
        input.objectKey,
      );

      if (
        metadata.contentLength !== payload.sizeBytes ||
        (metadata.contentType && metadata.contentType !== payload.contentType)
      ) {
        throw new BadRequestException('uploaded object metadata mismatch');
      }

      /** 생성된 자막 job. */
      const job = await this.prisma.subtitleJob.create({
        data: {
          expiresAt: createExpiresAt(this.getRetentionDays()),
          originalFileName: payload.fileName,
          sourceContentType: payload.contentType,
          sourceObjectKey: input.objectKey,
          sourceSizeBytes: payload.sizeBytes,
          whisperModel: payload.whisperModel,
        },
      });

      return this.toResponse(job);
    } catch (error) {
      await this.r2StorageService
        .deleteObject(completedObjectKey)
        .catch((deleteError) => {
          this.logger.error(
            `Subtitle completed source compensation failed: ${completedObjectKey} ${
              deleteError instanceof Error
                ? deleteError.message
                : String(deleteError)
            }`,
          );
        });

      throw error;
    }
  }

  /** R2 direct multipart upload를 취소한다. */
  async abortUpload(input: AbortSubtitleUploadInput) {
    /** 검증된 upload session payload. */
    const payload = this.verifyUploadToken(input.uploadToken);

    this.assertUploadTargetMatches(payload, input);

    await this.r2StorageService.abortMultipartUpload({
      objectKey: input.objectKey,
      uploadId: input.uploadId,
    });
  }

  /** 자막 job 상태를 조회한다. */
  async get(jobId: string) {
    /** 조회된 자막 job. */
    const job = await this.prisma.subtitleJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Subtitle job not found');
    }

    return this.toResponse(job);
  }

  /** 완료된 영어 SRT를 attachment 응답용 stream으로 가져온다. */
  async getFile(jobId: string): Promise<SubtitleFile> {
    /** 파일 전송 대상 job. */
    const job = await this.prisma.subtitleJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Subtitle job not found');
    }

    if (job.status !== SubtitleJobStatus.completed || !job.resultObjectKey) {
      throw new NotFoundException('Subtitle file not found');
    }

    if (job.expiresAt <= new Date()) {
      throw new GoneException('Subtitle file expired');
    }

    /** R2 object stream. */
    const stream = await this.r2StorageService.getObjectStream(
      job.resultObjectKey,
    );

    return {
      contentDisposition: createAttachmentDisposition(
        createSubtitleDownloadFileName(job.originalFileName),
      ),
      contentType: SRT_CONTENT_TYPE,
      stream,
    };
  }

  /** 업로드 파일을 검증한다. */
  private assertValidUpload(file: UploadedSubtitleFile) {
    if (file.size > this.getUploadMaxBytes()) {
      throw new PayloadTooLargeException('file is too large');
    }

    if (
      file.size <= 0 ||
      !file.path ||
      !isSupportedSubtitleVideoFile({
        contentType: file.mimetype,
        fileName: file.originalname,
      })
    ) {
      throw new BadRequestException('file must be mp4, mov, or webm video');
    }
  }

  /** direct upload metadata를 검증한다. */
  private assertValidUploadMetadata(input: CreateSubtitleUploadInput) {
    if (input.sizeBytes > this.getUploadMaxBytes()) {
      throw new PayloadTooLargeException('file is too large');
    }

    if (
      !Number.isFinite(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      !isSupportedSubtitleVideoFile({
        contentType: input.contentType,
        fileName: input.fileName,
      })
    ) {
      throw new BadRequestException('file must be mp4, mov, or webm video');
    }
  }

  /** upload token을 서명한다. */
  private signUploadToken(payload: SubtitleUploadTokenPayload) {
    /** base64url로 인코딩한 JSON payload. */
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    /** payload HMAC signature. */
    const signature = this.createUploadTokenSignature(encodedPayload);

    return `${encodedPayload}.${signature}`;
  }

  /** upload token을 검증하고 payload를 반환한다. */
  private verifyUploadToken(token: unknown): SubtitleUploadTokenPayload {
    if (typeof token !== 'string') {
      throw new BadRequestException('uploadToken is invalid');
    }

    /** token 구성요소. */
    const [encodedPayload, signature, ...rest] = token.split('.');

    if (!encodedPayload || !signature || rest.length > 0) {
      throw new BadRequestException('uploadToken is invalid');
    }

    /** 예상 HMAC signature. */
    const expectedSignature = this.createUploadTokenSignature(encodedPayload);
    /** signature buffer. */
    const signatureBuffer = Buffer.from(signature);
    /** expected signature buffer. */
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new BadRequestException('uploadToken is invalid');
    }

    try {
      /** JSON payload. */
      const payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as SubtitleUploadTokenPayload;

      if (
        !payload.objectKey ||
        !payload.uploadId ||
        !payload.fileName ||
        !payload.contentType ||
        !Number.isFinite(payload.sizeBytes) ||
        !Number.isFinite(payload.expiresAt) ||
        !parseSubtitleWhisperModel(payload.whisperModel)
      ) {
        throw new Error('invalid payload');
      }

      if (payload.expiresAt <= Date.now()) {
        throw new BadRequestException('uploadToken is expired');
      }

      return payload;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('uploadToken is invalid');
    }
  }

  /** upload token payload와 complete/abort 대상이 같은지 확인한다. */
  private assertUploadTargetMatches(
    payload: SubtitleUploadTokenPayload,
    input: { objectKey: string; uploadId: string },
  ) {
    if (
      payload.objectKey !== input.objectKey ||
      payload.uploadId !== input.uploadId
    ) {
      throw new BadRequestException('upload target does not match token');
    }
  }

  /** multipart complete에 사용할 part 목록을 정규화한다. */
  private normalizeUploadParts(parts: CompleteSubtitleUploadInput['parts']) {
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new BadRequestException('parts are required');
    }

    /** 중복 part 번호를 찾기 위한 집합. */
    const seenPartNumbers = new Set<number>();

    return [...parts]
      .sort((first, second) => first.partNumber - second.partNumber)
      .map((part) => {
        if (
          !Number.isInteger(part.partNumber) ||
          part.partNumber < 1 ||
          part.partNumber > SUBTITLE_UPLOAD_MAX_PARTS ||
          !part.etag
        ) {
          throw new BadRequestException('parts are invalid');
        }

        if (seenPartNumbers.has(part.partNumber)) {
          throw new BadRequestException('parts contain duplicate part numbers');
        }

        seenPartNumbers.add(part.partNumber);

        return part;
      });
  }

  /** upload token HMAC signature를 만든다. */
  private createUploadTokenSignature(encodedPayload: string) {
    /** upload token 서명 secret. */
    const secret =
      this.configService.get<string>('SUBTITLE_UPLOAD_TOKEN_SECRET') ??
      this.configService.get<string>('R2_SECRET_ACCESS_KEY');

    if (!secret) {
      throw new InternalServerErrorException(
        'Subtitle upload token secret is missing',
      );
    }

    return createHmac('sha256', secret)
      .update(encodedPayload)
      .digest('base64url');
  }

  /** job과 asset 상태를 UI 응답으로 변환한다. */
  private toResponse(job: {
    /** 자막 job ID. */
    id: string;
    /** 업로드한 원본 파일명. */
    originalFileName: string;
    /** 실제 job 상태. */
    status: SubtitleJobStatus;
    /** 실패 코드. */
    errorCode: string | null;
    /** 결과 SRT object key. */
    resultObjectKey: string | null;
    /** 선택한 Whisper 모델. */
    whisperModel: string;
    /** 보관 만료 시각. */
    expiresAt: Date;
    /** 생성 시각. */
    createdAt: Date;
  }): SubtitleJobResponse {
    /** asset 삭제/만료까지 반영한 화면 상태. */
    const displayStatus =
      job.status === SubtitleJobStatus.completed &&
      (!job.resultObjectKey || job.expiresAt <= new Date())
        ? 'expired'
        : job.status;
    /** 완료 SRT가 있을 때만 만드는 API file path. */
    const downloadUrl =
      displayStatus === SubtitleJobStatus.completed && job.resultObjectKey
        ? `/subtitles/jobs/${job.id}/file`
        : null;
    /** 화면에 전달할 지원 모델 값. */
    const whisperModel =
      parseSubtitleWhisperModel(job.whisperModel) ?? 'base_en';

    return {
      createdAt: job.createdAt.toISOString(),
      displayStatus,
      downloadUrl,
      errorCode:
        job.status === SubtitleJobStatus.failed
          ? ((job.errorCode ?? 'UNKNOWN') as SubtitleJobResponse['errorCode'])
          : null,
      fileName: job.originalFileName,
      jobId: job.id,
      message: createSubtitleStatusMessage(displayStatus, job.errorCode),
      progress: createSubtitleProgress(job.status),
      retentionDays: this.getRetentionDays(),
      stage: job.status,
      status: job.status,
      whisperModel,
    };
  }

  /** 업로드 최대 크기를 읽는다. */
  private getUploadMaxBytes() {
    return parsePositiveNumber(
      this.configService.get<string>('SUBTITLE_UPLOAD_MAX_BYTES'),
      DEFAULT_SUBTITLE_UPLOAD_MAX_BYTES,
    );
  }

  /** asset 보관 기간을 읽는다. */
  private getRetentionDays() {
    return parsePositiveNumber(
      this.configService.get<string>('ASSET_RETENTION_DAYS'),
      DEFAULT_SUBTITLE_RETENTION_DAYS,
    );
  }
}
