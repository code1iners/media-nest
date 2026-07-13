import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  runYoutubeDl,
  type YoutubeDlExecute,
} from '@mytube-extract/media-downloader';
import { existsSync } from 'fs';
import { exec as youtubeExec } from 'youtube-dl-exec';
import { MediaDownloaderOptions } from './media-download-options';
import { MediaDownloader } from './media-downloader.port';

/** youtube-dl-exec를 API media downloader port 뒤에 격리하는 adapter. */
@Injectable()
export class YoutubeDlMediaDownloader implements MediaDownloader {
  constructor(private readonly configService: ConfigService) {}

  /** API의 단일 실행 계약을 공통 yt-dlp runner에 위임한다. */
  async download(options: MediaDownloaderOptions) {
    /** ffmpeg 경로는 호출 옵션을 우선하고 환경 설정을 fallback으로 사용한다. */
    const ffmpegLocation =
      options.ffmpegLocation ?? this.configService.get('FFMPEG_LOCATION');
    /** 실제 존재하는 ffmpeg 경로만 yt-dlp에 전달한다. */
    const availableFfmpegLocation =
      ffmpegLocation && existsSync(ffmpegLocation) ? ffmpegLocation : '';
    /** youtube-dl-exec에 전달할 API 공통 옵션. */
    const youtubeOptions = {
      addMetadata: true,
      format: options.format,
      jsRuntimes: 'node' as const,
      output: options.outputPath,
      ...(availableFfmpegLocation
        ? { ffmpegLocation: availableFfmpegLocation }
        : {}),
      ...(options.audioFormat ? { audioFormat: options.audioFormat } : {}),
      ...(options.extractAudio ? { extractAudio: options.extractAudio } : {}),
      ...(options.mergeOutputFormat
        ? { mergeOutputFormat: options.mergeOutputFormat }
        : {}),
    };

    await runYoutubeDl({
      execute: youtubeExec as unknown as YoutubeDlExecute,
      outputPath: options.outputPath,
      signal: options.signal,
      sourceUrl: options.sourceUrl,
      youtubeOptions,
    });
  }
}
