import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaModule } from '../prisma/prisma.module';
import { R2StorageService } from '../downloads/r2-storage.service';
import {
  DEFAULT_SUBTITLE_UPLOAD_MAX_BYTES,
  parsePositiveNumber,
} from './subtitles.util';
import { SubtitlesController } from './subtitles.controller';
import { SubtitlesService } from './subtitles.service';

@Module({
  imports: [
    PrismaModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        /** Multer가 대용량 업로드를 메모리에 올리지 않도록 쓰는 임시 저장소. */
        const dest = join(tmpdir(), 'mytube-extract-subtitle-uploads');
        /** 업로드 단계에서 먼저 적용할 파일 크기 제한. */
        const fileSize = parsePositiveNumber(
          configService.get<string>('SUBTITLE_UPLOAD_MAX_BYTES'),
          DEFAULT_SUBTITLE_UPLOAD_MAX_BYTES,
        );

        return {
          dest,
          limits: {
            fields: 1,
            fileSize,
            files: 1,
          },
        };
      },
    }),
  ],
  controllers: [SubtitlesController],
  providers: [R2StorageService, SubtitlesService],
})
export class SubtitlesModule {}
