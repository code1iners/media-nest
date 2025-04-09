import { generate } from '@ce1pers/random-helpers';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { readdir, unlinkSync } from 'fs';
import { resolve } from 'path';
import { exec as youtubeExec } from 'youtube-dl-exec';
import { GetVideoByIdInput, GetVideoInput } from './dto/get-video.dto';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  constructor(private readonly configService: ConfigService) {}

  download(
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
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );

    // Set download directory.
    const outputDir = resolve(__dirname, '../downloads');

    // Set format.
    const format = resolution
      ? `bestvideo[height<=${resolution}]+bestaudio/best`
      : `bestvideo+bestaudio/best`;

    const downloadedPath = resolve(outputDir, filename);

    // Process.
    const downloadProcess = youtubeExec(url, {
      output: downloadedPath,
      format: format,
      ignoreErrors: true, // Keep going when developed errors.
      ffmpegLocation: this.configService.get('FFMPEG_LOCATION'),
      addMetadata: true,
      // dumpSingleJson: true, // Show metadata of the video.
    });

    downloadProcess.on('error', (err) => {
      this.logger.error(err);
    });

    downloadProcess.on('close', (code) => {
      this.logger.log(`code = ${code}, downloadedPath = ${downloadedPath}`);

      if (code === 0) {
        response.sendFile(`${downloadedPath}.webm`, (err) => {
          this.logger.log(`successfully Downloaded.`);
          if (err) {
            return response.status(500).send(err.message);
          }

          readdir(outputDir, (err, files) => {
            if (err) {
              return response.status(500).send(err.message);
            }

            this.logger.log(`files = ${files}`);

            files.forEach((file) => {
              unlinkSync(`${outputDir}/${file}`);
            });
          });
        });
      } else {
        unlinkSync(`${downloadedPath}`);
        this.logger.error(`youtube-dl exited with code ${code}`);
        response.status(500).send('Error generating audio file');
      }
    });
  }

  getVideoById(videoId: string, input: GetVideoByIdInput, response: Response) {
    try {
      this.logger.log(`input: ${JSON.stringify(input)}`);
      const { filename = generate({ length: 15 }), resolution } = input;

      // Set video url.
      const url = `https://www.youtube.com/watch?v=${videoId}`;

      this.download(url, filename, resolution, response);
    } catch (err) {
      this.logger.error(err);
    }
  }

  getVideo(input: GetVideoInput, response: Response) {
    try {
      const { url, filename = generate({ length: 15 }), resolution } = input;

      this.download(url, filename, resolution, response);
    } catch (err) {
      this.logger.error(err);
    }
  }
}
