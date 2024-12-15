import { generate } from '@ce1pers/random-helpers';
import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { PassThrough } from 'stream';
import { exec as youtubeExec } from 'youtube-dl-exec';
import { GetAudioByIdInput, GetAudioInput } from './dto/get-audio.dto';

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);

  process(url: string, filename: string, bitrate: number, response: Response) {
    // Set headers.
    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}.mp4"`,
    );

    // Set format.
    const format = bitrate ? `bestaudio[abr<=${bitrate}]` : `bestaudio`;

    // Process.
    const process = youtubeExec(
      url,
      {
        output: '-',
        format: format,
        ignoreErrors: true, // Keep going when developed errors.
        // dumpSingleJson: true, // Show metadata of the video.
      },
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );

    // Piping stream data.
    const passThrough = new PassThrough();
    process.stdout.pipe(passThrough);

    passThrough.pipe(response);
  }

  getAudio(input: GetAudioInput, response: Response) {
    const { url, bitrate, filename = generate({ length: 15 }) } = input;

    this.process(url, filename, bitrate, response);
  }

  getAudioById(videoId: string, input: GetAudioByIdInput, response: Response) {
    const { bitrate, filename = generate({ length: 15 }) } = input;

    const url = `https://www.youtube.com/watch?v=${videoId}`;

    this.process(url, filename, bitrate, response);
  }
}
