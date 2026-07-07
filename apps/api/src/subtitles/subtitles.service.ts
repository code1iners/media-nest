import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubtitleJobStatus } from '@mytube-extract/db';
import { randomUUID } from 'node:crypto';
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
  DEFAULT_SUBTITLE_RETENTION_DAYS,
  DEFAULT_SUBTITLE_UPLOAD_MAX_BYTES,
  isSupportedSubtitleVideoFile,
  parseSubtitleWhisperModel,
  parsePositiveNumber,
  SRT_CONTENT_TYPE,
} from './subtitles.util';
import {
  SubtitleFile,
  SubtitleJobResponse,
  UploadedSubtitleFile,
} from './subtitles.types';

/** 자막 추출 API service. */
@Injectable()
export class SubtitlesService {
  private readonly logger = new Logger(SubtitlesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly r2StorageService: R2StorageService,
  ) {}

  /** 업로드 파일을 R2에 저장하고 자막 job을 생성한다. */
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
      sourceObjectKey = createSubtitleSourceObjectKey(
        jobId,
        file.originalname,
      );

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
        await this.r2StorageService.deleteObject(sourceObjectKey).catch(
          (deleteError) => {
            this.logger.error(
              `Subtitle source compensation failed: ${sourceObjectKey} ${
                deleteError instanceof Error
                  ? deleteError.message
                  : String(deleteError)
              }`,
            );
          },
        );
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
    if (
      file.size <= 0 ||
      !file.path ||
      file.size > this.getUploadMaxBytes() ||
      !isSupportedSubtitleVideoFile({
        contentType: file.mimetype,
        fileName: file.originalname,
      })
    ) {
      throw new BadRequestException('file must be mp4, mov, or webm video');
    }
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
