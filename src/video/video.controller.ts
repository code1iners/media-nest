import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { GetVideoByIdInput, GetVideoInput } from './dto/get-video.dto';
import { VideoService } from './video.service';

@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Get(':id')
  getVideoById(
    @Param('id') id: string,
    @Query() input: GetVideoByIdInput,
    @Res() response: Response,
  ) {
    return this.videoService.getVideoById(id, input, response);
  }

  @Get('/')
  getVideo(@Query() input: GetVideoInput, @Res() response: Response) {
    return this.videoService.getVideo(input, response);
  }
}
