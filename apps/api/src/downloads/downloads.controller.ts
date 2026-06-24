import { CreateDownloadJobDto } from './dto/create-download-job.dto';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { DownloadsService } from './downloads.service';
import { DownloadResponse } from './downloads.types';

@Controller('downloads')
export class DownloadsController {
  constructor(private readonly downloadsService: DownloadsService) {}

  @Post('/')
  async createDownloadJob(
    @Body() input: CreateDownloadJobDto,
  ): Promise<DownloadResponse> {
    return this.downloadsService.create(input);
  }

  @Get(':jobId')
  getDownloadJob(@Param('jobId') jobId: string): Promise<DownloadResponse> {
    return this.downloadsService.get(jobId);
  }

  @Get(':jobId/file')
  async getDownloadFile(@Param('jobId') jobId: string) {
    /** R2에서 읽은 attachment 응답용 파일 정보. */
    const file = await this.downloadsService.getFile(jobId);

    return new StreamableFile(file.stream, {
      disposition: file.contentDisposition,
      type: file.contentType,
    });
  }
}
