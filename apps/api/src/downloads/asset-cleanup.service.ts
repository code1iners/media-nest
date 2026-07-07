import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { R2StorageService } from './r2-storage.service';

/** 만료 asset 정리 scheduler. */
@Injectable()
export class AssetCleanupService {
  private readonly logger = new Logger(AssetCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2Storage: R2StorageService,
  ) {}

  /** 매 1시간마다 R2 object와 asset row를 함께 정리한다. */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredAssets() {
    /** 현재 시각 기준 만료된 asset 목록. */
    const expiredAssets = await this.prisma.extractedAsset.findMany({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
    });

    for (const asset of expiredAssets) {
      try {
        await this.r2Storage.deleteObject(asset.objectKey);
        await this.prisma.extractedAsset.delete({
          where: { id: asset.id },
        });
      } catch (error) {
        this.logger.error(
          `Expired asset cleanup failed: ${asset.objectKey} ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    /** 현재 시각 기준 만료된 subtitle job 목록. */
    const expiredSubtitleJobs = await this.prisma.subtitleJob.findMany({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
    });

    for (const job of expiredSubtitleJobs) {
      try {
        await this.r2Storage.deleteObject(job.sourceObjectKey);

        if (job.resultObjectKey) {
          await this.r2Storage.deleteObject(job.resultObjectKey);
        }

        await this.prisma.subtitleJob.delete({
          where: { id: job.id },
        });
      } catch (error) {
        this.logger.error(
          `Expired subtitle cleanup failed: ${job.id} ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return expiredAssets.length + expiredSubtitleJobs.length;
  }
}
