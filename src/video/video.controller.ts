import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { sendMediaArtifact } from '../media/http-media-delivery';
import {
  parseVideoIdRequest,
  parseVideoUrlRequest,
} from '../media/media-request.util';
import { GetVideoByIdInput, GetVideoInput } from './dto/get-video.dto';
import { VideoService } from './video.service';

@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Get(':id')
  async getVideoById(
    @Param('id') id: string,
    @Query() input: GetVideoByIdInput,
    @Res() response: Response,
  ) {
    /** 검증된 YouTube ID 기반 비디오 요청. */
    const request = parseVideoIdRequest(id, input);
    /** 다운로드 생성이 완료된 비디오 artifact. */
    const artifact = await this.videoService.getVideo(request);

    return sendMediaArtifact(response, artifact);
  }

  @Get('/')
  async getVideo(@Query() input: GetVideoInput, @Res() response: Response) {
    /** 검증된 URL 기반 비디오 요청. */
    const request = parseVideoUrlRequest(input);
    /** 다운로드 생성이 완료된 비디오 artifact. */
    const artifact = await this.videoService.getVideo(request);

    return sendMediaArtifact(response, artifact);
  }
}
