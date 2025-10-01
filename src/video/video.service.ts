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
    this.logger.log({ url, filename, resolution });

    const filenameWithExt = `${filename}.mp4`;

    // Set headers.
    response.setHeader('Content-Type', 'video/mp4');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filenameWithExt)}`,
    );

    // Set download directory.
    const outputDir = resolve(__dirname, '../downloads');

    // Set format.
    const format = resolution
      ? `bestvideo[height<=${resolution}]+bestaudio/best`
      : `bestvideo+bestaudio/best`;

    const downloadedPath = resolve(
      outputDir,
      encodeURIComponent(filenameWithExt),
    );

    // Process.
    const downloadProcess = youtubeExec(url, {
      ffmpegLocation: this.configService.get('FFMPEG_LOCATION'),
      output: downloadedPath,
      format: format,
      mergeOutputFormat: 'mp4',
      ignoreErrors: true, // Keep going when developed errors.
      addMetadata: true,
      writeInfoJson: true,
    });

    downloadProcess.on('close', (code) => {
      this.logger.log(`code = ${code}, downloadedPath = ${downloadedPath}`);

      if (code === 0) {
        response.sendFile(downloadedPath, (err) => {
          if (err) {
            this.logger.error(err.message);
            return response.status(500).send(err.message);
          }

          this.logger.log(`successfully Downloaded.`);

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
        unlinkSync(downloadedPath);

        response.status(500).send('Failed generating.');
      }
    });

    downloadProcess.on('error', (err) => {
      this.logger.error(err);
      response.status(500).send(err.message);
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
