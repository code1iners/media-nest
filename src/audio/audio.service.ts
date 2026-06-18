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
import { GetAudioByIdInput, GetAudioInput } from './dto/get-audio.dto';

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);

  constructor(private readonly configService: ConfigService) {}

  private download(
    url: string,
    filename: string,
    bitrate: number | undefined,
    response: Response,
  ) {
    this.logger.log(url, filename, bitrate);

    /** 응답에 노출할 오디오 파일명. */
    const finalFileName = `${filename}.mp3`;

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

    /** 요청별 임시 작업 디렉터리. */
    const workDir = createMediaWorkDir();
    /** youtube-dl-exec가 생성할 오디오 파일 경로. */
    const tempFilePath = resolve(workDir, encodeURIComponent(finalFileName));
    /** 중복 이벤트로 응답이 두 번 전송되는 것을 막는 상태. */
    let settled = false;

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
      if (settled) {
        return;
      }

      settled = true;
      this.logger.error(err);
      cleanupMediaWorkDir(workDir);
      sendDownloadFailure(
        response,
        err.message || 'Error generating audio file',
      );
    });

    downloadProcess.on('close', (code) => {
      this.logger.log(`code = ${code}`);

      if (settled) {
        return;
      }

      if (code === 0) {
        response.sendFile(tempFilePath, (err) => {
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
        this.logger.error(`youtube-dl exited with code ${code}`);
        sendDownloadFailure(response, 'Error generating audio file');
      }
    });
  }

  getAudio(input: GetAudioInput, response: Response) {
    /** 검증된 원본 미디어 URL. */
    const url = normalizeSourceUrl(input.url);
    /** 검증된 다운로드 파일명. */
    const filename = normalizeDownloadName(
      input.filename || generate({ length: 15 }),
    );
    /** 검증된 최대 오디오 비트레이트. */
    const bitrate = parsePositiveInteger(input.bitrate, 'bitrate');

    this.download(url, filename, bitrate, response);
  }

  getAudioById(videoId: string, input: GetAudioByIdInput, response: Response) {
    /** 검증된 YouTube watch URL. */
    const url = createYoutubeWatchUrl(videoId);
    /** 검증된 다운로드 파일명. */
    const filename = normalizeDownloadName(
      input.filename || generate({ length: 15 }),
    );
    /** 검증된 최대 오디오 비트레이트. */
    const bitrate = parsePositiveInteger(input.bitrate, 'bitrate');

    this.download(url, filename, bitrate, response);
  }
}
