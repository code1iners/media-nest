import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AssetCleanupService } from './asset-cleanup.service';
import { DownloadsController } from './downloads.controller';
import { DownloadsService } from './downloads.service';
import { R2StorageService } from './r2-storage.service';

@Module({
  imports: [PrismaModule],
  controllers: [DownloadsController],
  providers: [AssetCleanupService, DownloadsService, R2StorageService],
})
export class DownloadsModule {}
