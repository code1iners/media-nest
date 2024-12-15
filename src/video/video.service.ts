import { generate } from '@ce1pers/random-helpers';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { unlinkSync } from 'fs';
import { exec as youtubeExec } from 'youtube-dl-exec';
import { GetVideoByIdInput, GetVideoInput } from './dto/get-video.dto';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  constructor(private readonly configService: ConfigService) {}

  process(
    url: string,
    filename: string,
    resolution: number,
    response: Response,
  ) {
    this.logger.log(url, filename, resolution);

    // Set headers.
    response.setHeader('Content-Type', 'video/mp4');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.mp4`,
    );

    // Set format.
    const format = resolution
      ? `bestvideo[height<=${resolution}]+bestaudio/best`
      : `bestvideo+bestaudio/best`;

    const tempFilePath = `/tmp/${filename}.mp3`;

    // Process.
    const process = youtubeExec(url, {
      output: tempFilePath,
      format: format,
      ignoreErrors: true, // Keep going when developed errors.
      ffmpegLocation: this.configService.get('FFMPEG_LOCATION'),
      addMetadata: true,
      // dumpSingleJson: true, // Show metadata of the video.
    });

    process.on('error', (err) => {
      this.logger.error(err);
    });

    process.on('close', (code) => {
      this.logger.log(`code = ${code}`);

      if (code === 0) {
        response.sendFile(tempFilePath, () => {
          unlinkSync(tempFilePath);
        });
      } else {
        this.logger.error(`youtube-dl exited with code ${code}`);
        response.status(500).send('Error generating audio file');
      }
    });
  }

  getVideoById(videoId: string, input: GetVideoByIdInput, response: Response) {
    const { filename = generate({ length: 15 }), resolution } = input;

    // Set video url.
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    this.process(url, filename, resolution, response);
  }

  getVideo(input: GetVideoInput, response: Response) {
    const { url, filename = generate({ length: 15 }), resolution } = input;

    this.process(url, filename, resolution, response);
  }
}
