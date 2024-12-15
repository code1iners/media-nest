import { generate } from '@ce1pers/random-helpers';
import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { PassThrough } from 'stream';
import { exec as youtubeExec } from 'youtube-dl-exec';
import { GetVideoByIdInput, GetVideoInput } from './dto/get-video.dto';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  process(
    url: string,
    filename: string,
    resolution: number,
    response: Response,
  ) {
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
