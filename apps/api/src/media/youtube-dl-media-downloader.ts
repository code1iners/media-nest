import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { exec as youtubeExec } from 'youtube-dl-exec';
import { MediaDownloaderOptions } from './media-download-options';
import { MediaDownloader } from './media-downloader.port';

/** youtube-dl-exec child process 중 필요한 이벤트/제어 표면. */
type YoutubeDlProcess = {
  /** child process 이벤트 리스너. */
  on: (event: 'error' | 'close', listener: (...args: never[]) => void) => void;
  /** youtube-dl-exec promise rejection을 처리한다. */
  catch?: (listener: (error: Error) => void) => void;
  /** abort 시 가능한 경우 child process를 종료한다. */
  kill?: () => void;
};

/** youtube-dl-exec를 media downloader port 뒤에 격리하는 adapter. */
@Injectable()
export class YoutubeDlMediaDownloader implements MediaDownloader {
  constructor(private readonly configService: ConfigService) {}

  /** youtube-dl-exec 프로세스를 실행하고 close/error 이벤트를 Promise로 정규화한다. */
  download(options: MediaDownloaderOptions) {
    return new Promise<void>((resolve, reject) => {
      /** 중복 process 이벤트로 Promise가 두 번 settle되는 것을 막는 상태. */
      let settled = false;
      /** ffmpeg 경로는 호출 옵션을 우선하고 환경 설정을 fallback으로 사용한다. */
      const ffmpegLocation =
        options.ffmpegLocation ?? this.configService.get('FFMPEG_LOCATION');
      /** 실제 존재하는 ffmpeg 경로만 yt-dlp에 전달한다. */
      const availableFfmpegLocation =
        ffmpegLocation && existsSync(ffmpegLocation) ? ffmpegLocation : '';
      /** youtube-dl-exec에 전달할 adapter 전용 공통 옵션. */
      const youtubeOptions = {
        addMetadata: true,
        format: options.format,
        ignoreErrors: true,
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

      const settle = (callback: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        options.signal?.removeEventListener('abort', abortDownload);
        callback();
      };

      const abortDownload = () => {
        settle(() => {
          downloadProcess.kill?.();
          reject(new Error('Media download timed out or was aborted'));
        });
      };

      /** youtube-dl-exec child process. */
      const downloadProcess = youtubeExec(
        options.sourceUrl,
        youtubeOptions,
      ) as unknown as YoutubeDlProcess;

      if (options.signal?.aborted) {
        abortDownload();
        return;
      }

      options.signal?.addEventListener('abort', abortDownload, { once: true });

      downloadProcess.catch?.((error: Error) => {
        settle(() => {
          reject(error);
        });
      });

      downloadProcess.on('error', (error: Error) => {
        settle(() => {
          reject(error);
        });
      });

      downloadProcess.on('close', (code: number) => {
        settle(() => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(new Error(`youtube-dl exited with code ${code}`));
        });
      });
    });
  }
}
