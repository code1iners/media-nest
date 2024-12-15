import { Module } from '@nestjs/common';
import { VideoModule } from './video/video.module';
import { HealthModule } from './health/health.module';
import { AudioModule } from './audio/audio.module';

@Module({
  imports: [VideoModule, HealthModule, AudioModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
