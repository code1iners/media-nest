import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { sendMediaArtifact } from '../media/http-media-delivery';
import {
  parseAudioIdRequest,
  parseAudioUrlRequest,
} from '../media/media-request.util';
import { AudioService } from './audio.service';
import { GetAudioByIdInput, GetAudioInput } from './dto/get-audio.dto';

@Controller('audio')
export class AudioController {
  constructor(private readonly audioService: AudioService) {}

  @Get('/')
  async getAudio(@Query() input: GetAudioInput, @Res() response: Response) {
    /** 검증된 URL 기반 오디오 요청. */
    const request = parseAudioUrlRequest(input);
    /** 다운로드 생성이 완료된 오디오 artifact. */
    const artifact = await this.audioService.getAudio(request);

    return sendMediaArtifact(response, artifact);
  }

  @Get(':id')
  async getAudioById(
    @Param('id') id: string,
    @Query() input: GetAudioByIdInput,
    @Res() response: Response,
  ) {
    /** 검증된 YouTube ID 기반 오디오 요청. */
    const request = parseAudioIdRequest(id, input);
    /** 다운로드 생성이 완료된 오디오 artifact. */
    const artifact = await this.audioService.getAudio(request);

    return sendMediaArtifact(response, artifact);
  }
}
