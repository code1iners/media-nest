import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { GetVideoInput } from './dto/get-video.dto';
import { VideoService } from './video.service';

@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Get(':id')
  getVideo(
    @Param('id') id: string,
    @Query() input: GetVideoInput,
    @Res() response: Response,
  ) {
    return this.videoService.getVideo(id, input, response);
  }
}
