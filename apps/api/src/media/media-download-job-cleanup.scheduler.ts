import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MediaDownloadJobService } from './media-download-job.service';

/** 완료된 다운로드 job 정리 주기. */
const CLEANUP_INTERVAL_MS = 60_000;

/** in-memory job 저장소에 남은 terminal job과 artifact를 주기적으로 정리한다. */
@Injectable()
export class MediaDownloadJobCleanupScheduler
  implements OnModuleInit, OnModuleDestroy
{
  /** cleanup interval handle. */
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly downloadJobService: MediaDownloadJobService) {}

  onModuleInit() {
    this.cleanupTimer = setInterval(() => {
      this.downloadJobService.cleanupExpiredJobs();
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy() {
    if (!this.cleanupTimer) {
      return;
    }

    clearInterval(this.cleanupTimer);
    this.cleanupTimer = undefined;
  }
}
