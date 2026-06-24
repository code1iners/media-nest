import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AudioModule } from './audio/audio.module';
import { DownloadsModule } from './downloads/downloads.module';
import { HealthModule } from './health/health.module';
import { VideoModule } from './video/video.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [`.env.${process.env.NODE_ENV}`, '.env'],
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    VideoModule,
    DownloadsModule,
    HealthModule,
    AudioModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
