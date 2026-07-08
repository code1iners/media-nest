import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  abortSubtitleUploadSchema,
  completeSubtitleUploadSchema,
  createSubtitleUploadSchema,
} from './subtitles.schemas';
import { SubtitlesService } from './subtitles.service';
import type {
  AbortSubtitleUploadInput,
  CompleteSubtitleUploadInput,
  CreateSubtitleUploadInput,
  SubtitleJobResponse,
  UploadedSubtitleFile,
} from './subtitles.types';

@Controller('subtitles')
export class SubtitlesController {
  constructor(private readonly subtitlesService: SubtitlesService) {}

  @Post('uploads')
  createSubtitleUpload(
    @Body(new ZodValidationPipe(createSubtitleUploadSchema))
    body: CreateSubtitleUploadInput,
  ) {
    return this.subtitlesService.createUpload(body);
  }

  @Post('uploads/complete')
  completeSubtitleUpload(
    @Body(new ZodValidationPipe(completeSubtitleUploadSchema))
    body: CompleteSubtitleUploadInput,
  ): Promise<SubtitleJobResponse> {
    return this.subtitlesService.completeUpload(body);
  }

  @Post('uploads/abort')
  async abortSubtitleUpload(
    @Body(new ZodValidationPipe(abortSubtitleUploadSchema))
    body: AbortSubtitleUploadInput,
  ) {
    await this.subtitlesService.abortUpload(body);

    return { ok: true };
  }

  /**
   * @deprecated subtitle-legacy-multipart-upload
   * R2 direct multipart upload 안정화 후 제거한다.
   */
  @Post('jobs')
  @UseInterceptors(FileInterceptor('file'))
  createSubtitleJob(
    @UploadedFile() file?: UploadedSubtitleFile,
    @Body('whisperModel') whisperModel?: string,
  ): Promise<SubtitleJobResponse> {
    return this.subtitlesService.create(file, whisperModel);
  }

  @Get('jobs/:jobId')
  getSubtitleJob(@Param('jobId') jobId: string): Promise<SubtitleJobResponse> {
    return this.subtitlesService.get(jobId);
  }

  @Get('jobs/:jobId/file')
  async getSubtitleFile(@Param('jobId') jobId: string) {
    /** R2에서 읽은 attachment 응답용 SRT 파일 정보. */
    const file = await this.subtitlesService.getFile(jobId);

    return new StreamableFile(file.stream, {
      disposition: file.contentDisposition,
      type: file.contentType,
    });
  }
}
