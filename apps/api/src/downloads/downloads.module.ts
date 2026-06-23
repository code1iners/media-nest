import { Module } from '@nestjs/common';
import { AudioService } from '../audio/audio.service';
import { MediaModule } from '../media/media.module';
import { VideoService } from '../video/video.service';
import { DownloadsController } from './downloads.controller';

@Module({
  imports: [MediaModule],
  controllers: [DownloadsController],
  providers: [AudioService, VideoService],
})
export class DownloadsModule {}
