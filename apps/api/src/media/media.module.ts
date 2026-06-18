import { Module } from '@nestjs/common';
import { MediaDownloadPolicy } from './media-download-policy';
import { MediaDownloadService } from './media-download.service';
import { MEDIA_DOWNLOADER } from './media-downloader.port';
import { YoutubeDlMediaDownloader } from './youtube-dl-media-downloader';

@Module({
  exports: [MediaDownloadService],
  providers: [
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
