import { generate } from '@ce1pers/random-helpers';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { PassThrough } from 'stream';
import { exec as youtubeExec } from 'youtube-dl-exec';
import { GetAudioByIdInput, GetAudioInput } from './dto/get-audio.dto';

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);

  constructor(private readonly configService: ConfigService) {}

  process(url: string, filename: string, bitrate: number, response: Response) {
    this.logger.log(url, filename, bitrate);

    // Set headers.
    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.mp3`,
    );

    // Set format.
    const format = bitrate
      ? `bestaudio[abr<=${bitrate}]/best`
      : `bestaudio/best`;

    // Process.
    const process = youtubeExec(
      url,
      {
        output: '-',
        format: format,
        ignoreErrors: true, // Keep going when developed errors.
        audioFormat: 'mp3',
        extractAudio: true,
        ffmpegLocation: this.configService.get('FFMPEG_LOCATION'),
        // dumpSingleJson: true, // Show metadata of the video.
      },
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );

    // Piping stream data.
    const passThrough = new PassThrough();
    process.stdout.pipe(passThrough);

    process.on('error', (err) => {
      this.logger.error(err);
    });

    process.on('close', (code) => {
      if (code !== 0) {
        this.logger.error(`youtube-dl exited with code ${code}`);
      }
    });

    passThrough.pipe(response);
  }

  getAudio(input: GetAudioInput, response: Response) {
    try {
      const { url, bitrate, filename = generate({ length: 15 }) } = input;

      this.process(url, filename, bitrate, response);
    } catch (err) {
      this.logger.error(err);
    }
  }

  getAudioById(videoId: string, input: GetAudioByIdInput, response: Response) {
    try {
      const { bitrate, filename = generate({ length: 15 }) } = input;

      const url = `https://www.youtube.com/watch?v=${videoId}`;

      this.process(url, filename, bitrate, response);
    } catch (err) {
      this.logger.error(err);
    }
  }
}
