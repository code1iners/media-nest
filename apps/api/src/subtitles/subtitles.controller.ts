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
import { SubtitlesService } from './subtitles.service';
import { SubtitleJobResponse, UploadedSubtitleFile } from './subtitles.types';

@Controller('subtitles/jobs')
export class SubtitlesController {
  constructor(private readonly subtitlesService: SubtitlesService) {}

  @Post('/')
  @UseInterceptors(FileInterceptor('file'))
  createSubtitleJob(
    @UploadedFile() file?: UploadedSubtitleFile,
    @Body('whisperModel') whisperModel?: string,
  ): Promise<SubtitleJobResponse> {
    return this.subtitlesService.create(file, whisperModel);
  }

  @Get(':jobId')
  getSubtitleJob(@Param('jobId') jobId: string): Promise<SubtitleJobResponse> {
    return this.subtitlesService.get(jobId);
  }

  @Get(':jobId/file')
  async getSubtitleFile(@Param('jobId') jobId: string) {
    /** R2에서 읽은 attachment 응답용 SRT 파일 정보. */
    const file = await this.subtitlesService.getFile(jobId);

    return new StreamableFile(file.stream, {
      disposition: file.contentDisposition,
      type: file.contentType,
    });
  }
}
