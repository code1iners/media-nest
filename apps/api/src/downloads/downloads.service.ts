import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExtractionJobStatus, ExtractionType } from '@mytube-extract/db';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDownloadJobDto } from './dto/create-download-job.dto';
import {
  parseDownloadQuality,
  parseDownloadType,
  parseYoutubeVideoId,
} from './downloads.util';
import { DownloadResponse, JobWithAsset } from './downloads.types';
import { R2StorageService } from './r2-storage.service';

/** asset 기본 보관 기간. */
const DEFAULT_RETENTION_DAYS = 7;

/** DB-backed downloads API service. */
@Injectable()
export class DownloadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly r2StorageService: R2StorageService,
  ) {}

  /** 추출 요청을 job row로 저장한다. */
  async create(input: CreateDownloadJobDto) {
    /** 검증된 추출 type. */
    const type = parseDownloadType(input.type);
    /** 검증된 품질 key. */
    const quality = parseDownloadQuality(type, input.quality);
    /** 요청 URL에서 추출한 YouTube video ID. */
    const videoId = parseYoutubeVideoId(input.url);
    /** 현재 재사용 가능한 asset 후보. */
    const reusableAsset = await this.prisma.extractedAsset.findFirst({
      where: {
        expiresAt: { gt: new Date() },
        quality,
        type,
        videoId,
      },
    });
    /** 실제 R2 object가 존재하는 asset만 재사용한다. */
    const verifiedReusableAsset =
      reusableAsset &&
      (await this.r2StorageService.objectExists(reusableAsset.objectKey))
        ? reusableAsset
        : null;

    if (reusableAsset && !verifiedReusableAsset) {
      await this.prisma.extractedAsset.delete({
        where: { id: reusableAsset.id },
      });
    }

    /** 생성된 job. */
    const job = await this.prisma.extractionJob.create({
      data: {
        assetId: verifiedReusableAsset?.id,
        quality,
        status: verifiedReusableAsset
          ? ExtractionJobStatus.completed
          : ExtractionJobStatus.queued,
        type,
        url: input.url?.trim() ?? '',
        videoId,
      },
      include: {
        asset: {
          select: {
            expiresAt: true,
            id: true,
            objectKey: true,
            title: true,
          },
        },
      },
    });

    return this.toResponse(job);
  }

  /** job 상태를 조회한다. */
  async get(jobId: string) {
    /** 조회된 job. */
    const job = await this.prisma.extractionJob.findUnique({
      include: {
        asset: {
          select: {
            expiresAt: true,
            id: true,
            objectKey: true,
            title: true,
          },
        },
      },
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Download job not found');
    }

    return this.toResponse(job);
  }

  /** 완료된 job의 R2 object를 attachment 응답용 stream으로 가져온다. */
  async getFile(jobId: string) {
    /** 파일 전송 대상 job. */
    const job = await this.prisma.extractionJob.findUnique({
      include: {
        asset: {
          select: {
            expiresAt: true,
            id: true,
            objectKey: true,
            title: true,
          },
        },
      },
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Download job not found');
    }

    if (job.status !== ExtractionJobStatus.completed || !job.asset) {
      throw new NotFoundException('Download file not found');
    }

    if (job.asset.expiresAt <= new Date()) {
      throw new GoneException('Download file expired');
    }

    /** R2 object stream. */
    const stream = await this.r2StorageService.getObjectStream(
      job.asset.objectKey,
    );
    /** attachment로 내려줄 파일명. */
    const fileName = createDownloadFileName(job.asset, job.type);

    return {
      contentDisposition: createAttachmentDisposition(fileName),
      contentType: createContentType(job.type),
      stream,
    };
  }

  /** job과 asset 상태를 UI 응답으로 변환한다. */
  private toResponse(job: JobWithAsset): DownloadResponse {
    /** asset 삭제/만료까지 반영한 화면 상태. */
    const displayStatus =
      job.status === ExtractionJobStatus.completed &&
      (!job.asset || job.asset.expiresAt <= new Date())
        ? 'expired'
        : job.status;
    /** 완료 asset이 있을 때만 만드는 API file path. */
    const downloadUrl =
      displayStatus === ExtractionJobStatus.completed && job.asset
        ? `/downloads/${job.id}/file`
        : null;

    return {
      createdAt: job.createdAt.toISOString(),
      displayStatus,
      downloadUrl,
      errorCode:
        job.status === ExtractionJobStatus.failed
          ? ((job.errorCode ?? 'UNKNOWN') as DownloadResponse['errorCode'])
          : null,
      jobId: job.id,
      message: createStatusMessage(displayStatus, job.errorCode),
      progress: createProgress(displayStatus),
      quality: job.quality as DownloadResponse['quality'],
      retentionDays: this.getRetentionDays(),
      status: job.status,
      type: job.type,
    };
  }

  /** asset 보관 기간을 읽는다. */
  private getRetentionDays() {
    return Number(
      this.configService.get<string>('ASSET_RETENTION_DAYS') ??
        DEFAULT_RETENTION_DAYS,
    );
  }
}

/** title이 있으면 실제 영상 제목을, 없으면 object key 마지막 segment를 다운로드 파일명으로 사용한다. */
function createDownloadFileName(
  asset: NonNullable<JobWithAsset['asset']>,
  type: ExtractionType,
) {
  /** 파일 확장자. */
  const extension = type === ExtractionType.audio ? 'mp3' : 'mp4';
  /** 파일명으로 쓸 수 있게 정리한 영상 제목. */
  const safeTitle = sanitizeDownloadTitle(asset.title);

  if (safeTitle) {
    return `${safeTitle}.${extension}`;
  }

  return (
    asset.objectKey.split('/').filter(Boolean).pop() ?? `download.${extension}`
  );
}

/** 다운로드 파일 MIME type을 만든다. */
function createContentType(type: ExtractionType) {
  return type === ExtractionType.audio ? 'audio/mpeg' : 'video/mp4';
}

/** 브라우저가 inline 재생하지 않도록 attachment disposition을 만든다. */
function createAttachmentDisposition(fileName: string) {
  /** filename fallback은 quoted-string을 깨는 문자를 제거한 ASCII 안전값. */
  const asciiFallback = createAsciiFallbackFileName(fileName);
  /** RFC 5987 filename* 파라미터용 UTF-8 percent-encoded 파일명. */
  const encodedFileName = encodeRFC5987ValueChars(fileName);

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFileName}`;
}

/** Content-Disposition filename* 값에서 허용되지 않는 문자를 추가로 percent-encode한다. */
function encodeRFC5987ValueChars(value: string) {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** 영상 제목을 다운로드 파일명으로 쓰기 전에 OS/HTTP에 위험한 문자를 정리한다. */
function sanitizeDownloadTitle(title: string | null | undefined) {
  return (
    title
      ?.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[. ]+|[. ]+$/g, '')
      .slice(0, 120)
      .trim()
      .replace(/^[. ]+|[. ]+$/g, '') || ''
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

  return `${baseName || 'download'}${extension}`;
}

/** 상태 기반 진행률을 만든다. */
function createProgress(status: DownloadResponse['displayStatus']) {
  if (status === ExtractionJobStatus.queued) {
    return 0;
  }

  if (status === ExtractionJobStatus.processing) {
    return 50;
  }

  if (status === ExtractionJobStatus.completed) {
    return 100;
  }

  return null;
}

/** 상태별 사용자 표시 메시지. */
function createStatusMessage(
  status: DownloadResponse['displayStatus'],
  errorCode: string | null,
) {
  if (status === ExtractionJobStatus.queued) {
    return '요청이 접수되어 대기 중입니다.';
  }

  if (status === ExtractionJobStatus.processing) {
    return '파일을 추출 중입니다. 잠시만 기다려 주세요.';
  }

  if (status === ExtractionJobStatus.completed) {
    return '파일이 준비되었습니다.';
  }

  if (status === ExtractionJobStatus.failed) {
    return createFailureMessage(errorCode);
  }

  return '보관 기간이 지났습니다. 다시 추출해 주세요.';
}

/** 실패 코드별 사용자 안내 문구를 만든다. */
function createFailureMessage(errorCode: string | null) {
  if (errorCode === 'VIDEO_TOO_LARGE') {
    return '파일 크기가 커서 현재 설정으로 처리할 수 없습니다. 낮은 화질로 다시 시도해 주세요.';
  }

  if (errorCode === 'YOUTUBE_AUTH_REQUIRED') {
    return 'YouTube 인증 확인이 필요해 다운로드에 실패했습니다.';
  }

  if (errorCode === 'YOUTUBE_FORMAT_UNAVAILABLE') {
    return '선택한 품질의 영상을 가져올 수 없습니다.';
  }

  if (errorCode === 'UPLOAD_FAILED') {
    return '파일 업로드 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  }

  return '추출에 실패했습니다. 다시 시도해 주세요.';
}
