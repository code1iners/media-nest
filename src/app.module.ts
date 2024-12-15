import { Module } from '@nestjs/common';
import { VideoModule } from './video/video.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [VideoModule, HealthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
