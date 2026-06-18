import { generate } from '@ce1pers/random-helpers';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { resolve } from 'path';
import { exec as youtubeExec } from 'youtube-dl-exec';
import {
  cleanupMediaWorkDir,
  createMediaWorkDir,
  createYoutubeWatchUrl,
  normalizeDownloadName,
  normalizeSourceUrl,
  parsePositiveInteger,
  sendDownloadFailure,
} from '../media/media-request.util';
import { GetVideoByIdInput, GetVideoInput } from './dto/get-video.dto';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  constructor(private readonly configService: ConfigService) {}

  private download(
    url: string,
    filename: string,
    resolution: number | undefined,
    response: Response,
  ) {
    this.logger.log({ url, filename, resolution });

    /** 응답에 노출할 비디오 파일명. */
    const filenameWithExt = `${filename}.mp4`;

    // Set headers.
    response.setHeader('Content-Type', 'video/mp4');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filenameWithExt)}`,
    );

    /** 요청별 임시 작업 디렉터리. */
    const workDir = createMediaWorkDir();

    // Set format.
    const format = resolution
      ? `bestvideo[height<=${resolution}]+bestaudio/best`
      : `bestvideo+bestaudio/best`;

    /** youtube-dl-exec가 생성할 비디오 파일 경로. */
    const downloadedPath = resolve(
      workDir,
      encodeURIComponent(filenameWithExt),
    );
    /** 중복 이벤트로 응답이 두 번 전송되는 것을 막는 상태. */
    let settled = false;

    // Process.
    const downloadProcess = youtubeExec(url, {
      ffmpegLocation: this.configService.get('FFMPEG_LOCATION'),
      output: downloadedPath,
      format: format,
      mergeOutputFormat: 'mp4',
      ignoreErrors: true, // Keep going when developed errors.
      addMetadata: true,
      // writeInfoJson: true,
    });

    downloadProcess.on('close', (code) => {
      this.logger.log(`code = ${code}, downloadedPath = ${downloadedPath}`);

      if (settled) {
        return;
      }

      if (code === 0) {
        response.sendFile(downloadedPath, (err) => {
          settled = true;
          cleanupMediaWorkDir(workDir);

          if (err) {
            this.logger.error(err.message);
            sendDownloadFailure(response, err.message);
            return;
          }

          this.logger.log(`successfully Downloaded.`);
        });
      } else {
        settled = true;
        cleanupMediaWorkDir(workDir);
        sendDownloadFailure(response, 'Failed generating video file');
      }
    });

    downloadProcess.on('error', (err) => {
      if (settled) {
        return;
      }

      settled = true;
      this.logger.error(err);
      cleanupMediaWorkDir(workDir);
      sendDownloadFailure(
        response,
        err.message || 'Failed generating video file',
      );
    });
  }

  getVideoById(videoId: string, input: GetVideoByIdInput, response: Response) {
    this.logger.log(`input: ${JSON.stringify(input)}`);

    /** 검증된 YouTube watch URL. */
    const url = createYoutubeWatchUrl(videoId);
    /** 검증된 다운로드 파일명. */
    const filename = normalizeDownloadName(
      input.filename || generate({ length: 15 }),
    );
    /** 검증된 최대 영상 높이. */
    const resolution = parsePositiveInteger(input.resolution, 'resolution');

    this.download(url, filename, resolution, response);
  }

  getVideo(input: GetVideoInput, response: Response) {
    /** 검증된 원본 미디어 URL. */
    const url = normalizeSourceUrl(input.url);
    /** 검증된 다운로드 파일명. */
    const filename = normalizeDownloadName(
      input.filename || generate({ length: 15 }),
    );
    /** 검증된 최대 영상 높이. */
    const resolution = parsePositiveInteger(input.resolution, 'resolution');

    this.download(url, filename, resolution, response);
  }
}
