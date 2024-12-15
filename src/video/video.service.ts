import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { PassThrough } from 'stream';
import { exec as youtubeExec } from 'youtube-dl-exec';
import { GetVideoInput } from './dto/get-video.dto';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  getVideo(videoId: string, input: GetVideoInput, response: Response) {
    const { filename, resolution = 360 } = input;

    // Set video url.
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    // Set headers.
    response.setHeader('Content-Type', 'video/mp4');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}.mp4"`,
    );

    // Set format.
    const format = `bestvideo[height<=${resolution}]+bestaudio/best`;

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
}
