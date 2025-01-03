import { generate } from '@ce1pers/random-helpers';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { unlinkSync } from 'fs';
import { resolve } from 'path';
import { exec as youtubeExec } from 'youtube-dl-exec';
import { GetAudioByIdInput, GetAudioInput } from './dto/get-audio.dto';

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);

  constructor(private readonly configService: ConfigService) {}

  download(url: string, filename: string, bitrate: number, response: Response) {
    this.logger.log(url, filename, bitrate);

    const finalFileName = `${filename}.mp4`;

    // Set headers.
    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(finalFileName)}`,
    );

    // Set format.
    const format = bitrate
      ? `bestaudio[abr<=${bitrate}]/best`
      : `bestaudio/best`;

    const tempFilePath = resolve(__dirname, '../downloads', finalFileName);

    // Process.
    const downloadProcess = youtubeExec(
      url,
      {
        output: tempFilePath,
        format: format,
        ignoreErrors: true, // Keep going when developed errors.
        audioFormat: 'mp3',
        extractAudio: true,
        ffmpegLocation: this.configService.get('FFMPEG_LOCATION'),
        addMetadata: true,
        // dumpSingleJson: true, // Show metadata of the video.
      },
      // { stdio: ['ignore', 'pipe', 'ignore'] },
    );

    downloadProcess.on('error', (err) => {
      this.logger.error(err);
    });

    downloadProcess.on('close', (code) => {
      this.logger.log(`code = ${code}`);

      if (code === 0) {
        response.sendFile(tempFilePath, () => {
          unlinkSync(tempFilePath);
          this.logger.log(`successfully Downloaded.`);
        });
      } else {
        unlinkSync(tempFilePath);
        this.logger.error(`youtube-dl exited with code ${code}`);
        response.status(500).send('Error generating audio file');
      }
    });
  }

  getAudio(input: GetAudioInput, response: Response) {
    try {
      const { url, bitrate, filename = generate({ length: 15 }) } = input;

      this.download(url, filename, bitrate, response);
    } catch (err) {
      this.logger.error(err);
    }
  }

  getAudioById(videoId: string, input: GetAudioByIdInput, response: Response) {
    try {
      const { bitrate, filename = generate({ length: 15 }) } = input;

      const url = `https://www.youtube.com/watch?v=${videoId}`;

      this.download(url, filename, bitrate, response);
    } catch (err) {
      this.logger.error(err);
    }
  }
}
