import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';

@Module({
  imports: [MediaModule],
  controllers: [AudioController],
  providers: [AudioService],
})
export class AudioModule {}
