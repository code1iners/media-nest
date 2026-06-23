import { Module } from '@nestjs/common';
import { MediaDownloadJobCleanupScheduler } from './media-download-job-cleanup.scheduler';
import { MediaDownloadJobService } from './media-download-job.service';
import { MediaDownloadPolicy } from './media-download-policy';
import { MediaDownloadService } from './media-download.service';
import { MEDIA_DOWNLOADER } from './media-downloader.port';
import { YoutubeDlMediaDownloader } from './youtube-dl-media-downloader';

@Module({
  exports: [MediaDownloadJobService, MediaDownloadService],
  providers: [
    MediaDownloadJobCleanupScheduler,
    MediaDownloadJobService,
    MediaDownloadPolicy,
    MediaDownloadService,
    YoutubeDlMediaDownloader,
    {
      provide: MEDIA_DOWNLOADER,
      useExisting: YoutubeDlMediaDownloader,
    },
  ],
})
export class MediaModule {}
