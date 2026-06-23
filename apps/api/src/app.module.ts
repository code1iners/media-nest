import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AudioModule } from './audio/audio.module';
import { DownloadsModule } from './downloads/downloads.module';
import { HealthModule } from './health/health.module';
import { VideoModule } from './video/video.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env.${process.env.NODE_ENV}`,
      isGlobal: true,
    }),
    VideoModule,
    DownloadsModule,
    HealthModule,
    AudioModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
