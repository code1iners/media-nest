import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AudioService } from '../audio/audio.service';
import { sendMediaArtifact } from '../media/http-media-delivery';
import { MediaDownloadJobService } from '../media/media-download-job.service';
import { DownloadJobSnapshot } from '../media/media-download-job.types';
import {
  parseAudioUrlRequest,
  parseVideoUrlRequest,
} from '../media/media-request.util';
import { VideoService } from '../video/video.service';
import { CreateDownloadJobDto } from './dto/create-download-job.dto';

/** 다운로드 job 생성 응답. */
type CreateDownloadJobResponse = DownloadJobSnapshot & {
  /** 상태 조회 URL. */
  statusUrl: string;
  /** ready 파일 다운로드 URL. */
  fileUrl: string;
};

@Controller('downloads')
export class DownloadsController {
  constructor(
    private readonly audioService: AudioService,
    private readonly videoService: VideoService,
    private readonly downloadJobService: MediaDownloadJobService,
  ) {}

  @Post('/')
  createDownloadJob(
    @Body() input: CreateDownloadJobDto,
  ): CreateDownloadJobResponse {
    /** 검증된 다운로드 실행 job. */
    const job =
      input.type === 'audio'
        ? this.audioService.createAudioDownloadJob(
            parseAudioUrlRequest({
              bitrate: input.quality,
              filename: input.filename,
              url: input.url,
            }),
          )
        : input.type === 'video'
          ? this.videoService.createVideoDownloadJob(
              parseVideoUrlRequest({
                filename: input.filename,
                resolution: input.quality,
                url: input.url,
              }),
            )
          : undefined;

    if (!job) {
      throw new BadRequestException('type must be audio or video');
    }

    /** 생성된 다운로드 job 상태. */
    const snapshot = this.downloadJobService.create(job);

    return {
      ...snapshot,
      fileUrl: `/downloads/${snapshot.jobId}/file`,
      statusUrl: `/downloads/${snapshot.jobId}`,
    };
  }

  @Get(':jobId')
  getDownloadJob(@Param('jobId') jobId: string): DownloadJobSnapshot {
    return this.downloadJobService.get(jobId);
  }

  @Get(':jobId/file')
  async downloadReadyFile(
    @Param('jobId') jobId: string,
    @Res() response: Response,
  ) {
    /** ready 상태에서만 꺼낼 수 있는 다운로드 artifact. */
    const artifact = this.downloadJobService.consumeReadyArtifact(jobId);

    return sendMediaArtifact(response, artifact);
  }

  @Delete(':jobId')
  cancelDownloadJob(@Param('jobId') jobId: string): DownloadJobSnapshot {
    return this.downloadJobService.cancel(jobId);
  }
}
