import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';

@Module({
  imports: [MediaModule],
  controllers: [VideoController],
  providers: [VideoService],
})
export class VideoModule {}
