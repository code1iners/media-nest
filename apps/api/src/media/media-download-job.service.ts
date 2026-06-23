import {
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MediaDownloadPolicy } from './media-download-policy';
import {
  MediaDownloadService,
  YOUTUBE_AUTH_REQUIRED_FAILURE_MESSAGE,
} from './media-download.service';
import {
  DownloadJobRecord,
  DownloadJobSnapshot,
} from './media-download-job.types';
import {
  MediaDownloadArtifact,
  MediaDownloadJob,
} from './media-download.types';
import { createSafeErrorLog } from './media-log-redaction';

/** 완료된 job이 조회 가능하게 남아있는 기본 시간. */
const DEFAULT_JOB_TTL_MS = 30 * 60 * 1000;

/** 설정이 없을 때 허용하는 최대 대기열 길이. */
const DEFAULT_QUEUE_LIMIT = 20;

/** 설정이 없을 때 동시에 실행하는 job 수. */
const DEFAULT_CONCURRENCY_LIMIT = 1;

/** in-memory 다운로드 job queue. */
@Injectable()
export class MediaDownloadJobService {
  private readonly logger = new Logger(MediaDownloadJobService.name);

  /** job ID별 현재 상태 저장소. */
  private readonly jobs = new Map<string, DownloadJobRecord>();

  /** 실행 대기 중인 job ID FIFO queue. */
  private readonly queue: string[] = [];

  /** 현재 실행 중인 job 수. */
  private runningCount = 0;

  /** 같은 tick에서 drain scheduling을 중복하지 않기 위한 flag. */
  private drainScheduled = false;

  constructor(
    private readonly mediaDownloadService: MediaDownloadService,
    private readonly policy: MediaDownloadPolicy,
  ) {}

  /** 다운로드 job을 만들고 queue에 넣는다. */
  create(input: MediaDownloadJob): DownloadJobSnapshot {
    /** 현재 queue 정책. */
    const policyConfig = this.policy.getConfig();
    /** 최대 대기열 길이. */
    const queueLimit = policyConfig.queueLimit ?? DEFAULT_QUEUE_LIMIT;

    if (this.queue.length >= queueLimit) {
      throw new HttpException(
        'Download queue is full',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    /** job 생성 시각. */
    const now = Date.now();
    /** 새 다운로드 job record. */
    const job: DownloadJobRecord = {
      abortController: new AbortController(),
      createdAt: now,
      input,
      jobId: randomUUID(),
      status: 'queued',
      type: input.kind,
      updatedAt: now,
    };

    this.jobs.set(job.jobId, job);
    this.queue.push(job.jobId);
    this.scheduleDrain();

    return this.toSnapshot(job);
  }

  /** job 상태를 조회한다. */
  get(jobId: string): DownloadJobSnapshot {
    return this.toSnapshot(this.getRecord(jobId));
  }

  /** queue 대기 또는 실행 중인 job을 취소한다. */
  cancel(jobId: string): DownloadJobSnapshot {
    /** 취소 대상 job. */
    const job = this.getRecord(jobId);

    if (job.status === 'queued') {
      this.removeQueuedJob(jobId);
    }

    if (job.status === 'ready' && !job.consumed) {
      job.artifact?.cleanup();
      job.artifact = undefined;
    }

    if (job.status === 'running') {
      job.abortController.abort();
    }

    if (!['failed', 'expired'].includes(job.status)) {
      this.mark(job, 'canceled', '다운로드 작업을 취소했습니다.');
    }

    return this.toSnapshot(job);
  }

  /** ready job의 artifact를 파일 응답 boundary로 넘긴다. */
  consumeReadyArtifact(jobId: string): MediaDownloadArtifact {
    /** 다운로드할 job. */
    const job = this.getRecord(jobId);

    if (job.status === 'queued' || job.status === 'running') {
      throw new ConflictException('Download job is not ready');
    }

    if (job.status === 'failed') {
      throw new ConflictException(job.message ?? 'Download job failed');
    }

    if (job.status === 'canceled') {
      throw new GoneException('Download job was canceled');
    }

    if (job.status === 'expired' || job.consumed || !job.artifact) {
      throw new GoneException('Download job file is no longer available');
    }

    job.consumed = true;

    /** cleanup 중복 실행을 막는 원본 artifact. */
    const artifact = job.artifact;
    /** delivery callback 중복 cleanup 방지 flag. */
    let cleaned = false;

    return {
      ...artifact,
      cleanup: () => {
        if (cleaned) {
          return;
        }

        cleaned = true;
        artifact.cleanup();
        job.artifact = undefined;
        this.mark(job, 'expired', '다운로드 파일을 정리했습니다.');
      },
    };
  }

  /** 만료된 terminal job과 남은 임시 파일을 정리한다. */
  cleanupExpiredJobs(now = Date.now(), ttlMs = DEFAULT_JOB_TTL_MS) {
    /** 정리된 job 수. */
    let cleanedCount = 0;

    for (const job of this.jobs.values()) {
      if (job.status === 'queued' || job.status === 'running') {
        continue;
      }

      if (now - job.updatedAt < ttlMs) {
        continue;
      }

      job.artifact?.cleanup();
      this.jobs.delete(job.jobId);
      cleanedCount += 1;
    }

    return cleanedCount;
  }

  /** job queue를 다음 tick에 실행한다. */
  private scheduleDrain() {
    if (this.drainScheduled) {
      return;
    }

    this.drainScheduled = true;
    queueMicrotask(() => {
      this.drainScheduled = false;
      this.drain();
    });
  }

  /** 가능한 만큼 FIFO queue에서 job을 실행한다. */
  private drain() {
    /** 현재 동시 실행 제한. */
    const concurrencyLimit =
      this.policy.getConfig().concurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT;

    while (this.runningCount < concurrencyLimit && this.queue.length > 0) {
      /** 다음 실행 후보 job ID. */
      const jobId = this.queue.shift();

      if (!jobId) {
        return;
      }

      /** 다음 실행 대상 job. */
      const job = this.jobs.get(jobId);

      if (!job || job.status !== 'queued') {
        continue;
      }

      this.runningCount += 1;
      this.mark(job, 'running');
      void this.run(job);
    }
  }

  /** 실제 미디어 다운로드 lifecycle을 실행한다. */
  private async run(job: DownloadJobRecord) {
    try {
      /** 생성 완료된 다운로드 artifact. */
      const artifact = await this.mediaDownloadService.download({
        ...job.input,
        signal: job.abortController.signal,
      });

      if (job.status === 'canceled') {
        artifact.cleanup();
        return;
      }

      job.artifact = artifact;
      this.mark(job, 'ready');
    } catch (error) {
      if (job.status === 'canceled') {
        return;
      }

      this.logger.error(
        `Download job failed: ${job.type} ${job.input.source.safeLabel} ${createSafeErrorLog(
          error,
        )}`,
      );
      this.mark(job, 'failed', getJobFailureMessage(error));
    } finally {
      this.runningCount -= 1;
      this.scheduleDrain();
    }
  }

  /** job 상태와 updatedAt을 함께 바꾼다. */
  private mark(
    job: DownloadJobRecord,
    status: DownloadJobRecord['status'],
    message?: string,
  ) {
    job.status = status;
    job.message = message;
    job.updatedAt = Date.now();
  }

  /** 저장된 job record를 가져온다. */
  private getRecord(jobId: string) {
    /** 조회된 job record. */
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new NotFoundException('Download job not found');
    }

    return job;
  }

  /** queued job을 FIFO queue에서 제거한다. */
  private removeQueuedJob(jobId: string) {
    /** queue 안의 job 위치. */
    const queueIndex = this.queue.indexOf(jobId);

    if (queueIndex >= 0) {
      this.queue.splice(queueIndex, 1);
    }
  }

  /** 내부 record를 외부 응답 snapshot으로 바꾼다. */
  private toSnapshot(job: DownloadJobRecord): DownloadJobSnapshot {
    return {
      createdAt: new Date(job.createdAt).toISOString(),
      jobId: job.jobId,
      message: job.message,
      status: job.status,
      type: job.type,
      updatedAt: new Date(job.updatedAt).toISOString(),
    };
  }
}

/** client에 노출해도 되는 job 실패 메시지를 고른다. */
function getJobFailureMessage(error: unknown) {
  if (error instanceof HttpException) {
    /** Nest HTTP exception response body. */
    const response = error.getResponse();
    /** response object가 담은 client message. */
    const message =
      typeof response === 'object' && response && 'message' in response
        ? response.message
        : undefined;

    if (message === YOUTUBE_AUTH_REQUIRED_FAILURE_MESSAGE) {
      return YOUTUBE_AUTH_REQUIRED_FAILURE_MESSAGE;
    }
  }

  return '다운로드 작업에 실패했습니다.';
}
