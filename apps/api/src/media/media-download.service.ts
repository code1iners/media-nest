import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { resolve } from 'path';
import { cleanupMediaWorkDir, createMediaWorkDir } from './media-request.util';
import { MediaDownloadPolicy } from './media-download-policy';
import {
  MediaDownloadArtifact,
  MediaDownloadJob,
} from './media-download.types';
import { MEDIA_DOWNLOADER, MediaDownloader } from './media-downloader.port';
import { createSafeErrorLog } from './media-log-redaction';

/** 공통 미디어 다운로드 lifecycle을 담당하는 deep module. */
@Injectable()
export class MediaDownloadService {
  private readonly logger = new Logger(MediaDownloadService.name);

  /** 현재 생성 중인 다운로드 수. */
  private activeDownloads = 0;

  constructor(
    @Inject(MEDIA_DOWNLOADER)
    private readonly downloader: MediaDownloader,
    private readonly policy: MediaDownloadPolicy,
  ) {}

  /** 임시 작업 디렉터리 생성부터 downloader 실행까지의 공통 lifecycle을 수행한다. */
  async download(job: MediaDownloadJob): Promise<MediaDownloadArtifact> {
    /** 현재 요청에 적용할 실행 보호 정책. */
    const policyConfig = this.policy.getConfig();

    if (
      policyConfig.concurrencyLimit &&
      this.activeDownloads >= policyConfig.concurrencyLimit
    ) {
      throw new HttpException(
        'Too many active media downloads',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.activeDownloads += 1;

    /** 요청별 임시 작업 디렉터리. */
    const workDir = createMediaWorkDir();
    /** downloader가 생성할 결과 파일 경로. */
    const filePath = resolve(workDir, encodeURIComponent(job.downloadName));
    /** timeout 설정이 있을 때 downloader를 중단하기 위한 컨트롤러. */
    const abortController = new AbortController();
    /** job API 취소 신호를 기존 lifecycle의 abort controller로 전달한다. */
    const abortFromJobSignal = () => abortController.abort();
    /** cleanup 중복 실행을 막는 상태. */
    let cleaned = false;
    /** timeout timer 식별자. */
    let timeoutHandle: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (cleaned) {
        return;
      }

      cleaned = true;
      cleanupMediaWorkDir(workDir);
    };

    try {
      if (job.signal) {
        if (job.signal.aborted) {
          abortController.abort();
        } else {
          job.signal.addEventListener('abort', abortFromJobSignal, {
            once: true,
          });
        }
      }

      if (policyConfig.timeoutMs) {
        timeoutHandle = setTimeout(() => {
          abortController.abort();
        }, policyConfig.timeoutMs);
      }

      await this.downloader.download({
        audioFormat: job.audioFormat,
        extractAudio: job.extractAudio,
        format: job.format,
        kind: job.kind,
        mergeOutputFormat: job.mergeOutputFormat,
        outputPath: filePath,
        signal: abortController.signal,
        sourceUrl: job.source.url,
      });

      return {
        cleanup,
        contentType: job.contentType,
        downloadName: job.downloadName,
        filePath,
        kind: job.kind,
      };
    } catch (error) {
      cleanup();
      this.logger.error(
        `Media download failed: ${job.kind} ${job.source.safeLabel} ${createSafeErrorLog(
          error,
        )}`,
      );
      throw new InternalServerErrorException(job.failureMessage);
    } finally {
      job.signal?.removeEventListener('abort', abortFromJobSignal);

      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      this.activeDownloads -= 1;
    }
  }
}
