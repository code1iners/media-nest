import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AudioService } from './audio.service';
import { GetAudioInput } from './dto/get-audio.dto';

@Controller('audio')
export class AudioController {
  constructor(private readonly audioService: AudioService) {}

  @Get('/')
  getAudio(@Query() input: GetAudioInput, @Res() response: Response) {
    return this.audioService.getAudio(input, response);
  }

  @Get(':id')
  getAudioById(
    @Param('id') id: string,
    @Query() input: GetAudioInput,
    @Res() response: Response,
  ) {
    return this.audioService.getAudioById(id, input, response);
  }
}
