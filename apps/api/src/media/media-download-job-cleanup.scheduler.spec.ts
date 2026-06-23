import { MediaDownloadJobCleanupScheduler } from './media-download-job-cleanup.scheduler';
import { MediaDownloadJobService } from './media-download-job.service';

describe('MediaDownloadJobCleanupScheduler', () => {
  /** 다운로드 job service mock. */
  const downloadJobServiceMock = {
    cleanupExpiredJobs: jest.fn(),
  };

  let scheduler: MediaDownloadJobCleanupScheduler;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    scheduler = new MediaDownloadJobCleanupScheduler(
      downloadJobServiceMock as unknown as MediaDownloadJobService,
    );
  });

  afterEach(() => {
    scheduler.onModuleDestroy();
    jest.useRealTimers();
  });

  it('runs expired job cleanup every minute until destroyed', () => {
    scheduler.onModuleInit();

    jest.advanceTimersByTime(60_000);

    expect(downloadJobServiceMock.cleanupExpiredJobs).toHaveBeenCalledTimes(1);

    scheduler.onModuleDestroy();
    jest.advanceTimersByTime(60_000);

    expect(downloadJobServiceMock.cleanupExpiredJobs).toHaveBeenCalledTimes(1);
  });
});
