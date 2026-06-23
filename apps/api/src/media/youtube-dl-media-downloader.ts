import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import type { Readable } from 'stream';
import { exec as youtubeExec } from 'youtube-dl-exec';
import { MediaDownloaderOptions } from './media-download-options';
import { MediaDownloader } from './media-downloader.port';

/** youtube-dl-exec child process 중 필요한 이벤트/제어 표면. */
type YoutubeDlProcess = {
  /** child process 이벤트 리스너. */
  on: {
    (event: 'error', listener: (error: Error) => void): void;
    (
      event: 'close',
      listener: (code: number | null, signal: NodeJS.Signals | null) => void,
    ): void;
  };
  /** youtube-dl-exec promise rejection을 처리한다. */
  catch?: (listener: (error: Error) => void) => void;
  /** abort 시 가능한 경우 child process를 종료한다. */
  kill?: () => void;
  /** process kill 여부. */
  killed?: boolean;
  /** stdout stream. */
  stdout?: Readable;
  /** stderr stream. */
  stderr?: Readable;
};

/** yt-dlp 실패 원인 확인에 남길 stream tail line 수. */
const DIAGNOSTIC_TAIL_LINES = 12;

/** Error에 붙이는 server-only downloader 진단 정보. */
type DownloaderDiagnostic = {
  /** 진단 대상 도구 이름. */
  tool: 'yt-dlp';
  /** 알려진 downloader 실패 분류. */
  reason?: 'youtube-auth-required';
  /** 프로세스 종료 코드. */
  exitCode?: number | null;
  /** 프로세스 종료 signal. */
  signal?: NodeJS.Signals | null;
  /** 프로세스 kill 여부. */
  killed?: boolean;
  /** stdout 마지막 일부. */
  stdoutTail?: string;
  /** stderr 마지막 일부. */
  stderrTail?: string;
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
          reject(
            attachDiagnostic(
              new Error('Media download timed out or was aborted'),
              {
                killed: downloadProcess.killed,
                stderrTail: stderrTail(),
                stdoutTail: stdoutTail(),
                tool: 'yt-dlp',
              },
            ),
          );
        });
      };

      /** youtube-dl-exec child process. */
      const downloadProcess = youtubeExec(
        options.sourceUrl,
        youtubeOptions,
      ) as unknown as YoutubeDlProcess;
      /** stdout 마지막 줄 수집기. */
      const stdoutTail = createStreamTail(downloadProcess.stdout);
      /** stderr 마지막 줄 수집기. */
      const stderrTail = createStreamTail(downloadProcess.stderr);

      if (options.signal?.aborted) {
        abortDownload();
        return;
      }

      options.signal?.addEventListener('abort', abortDownload, { once: true });

      downloadProcess.catch?.((error: Error) => {
        settle(() => {
          reject(
            attachDiagnostic(error, {
              killed: downloadProcess.killed,
              reason: detectDiagnosticReason(stderrTail()),
              stderrTail: stderrTail(),
              stdoutTail: stdoutTail(),
              tool: 'yt-dlp',
            }),
          );
        });
      });

      downloadProcess.on('error', (error: Error) => {
        settle(() => {
          reject(
            attachDiagnostic(error, {
              killed: downloadProcess.killed,
              reason: detectDiagnosticReason(stderrTail()),
              stderrTail: stderrTail(),
              stdoutTail: stdoutTail(),
              tool: 'yt-dlp',
            }),
          );
        });
      });

      downloadProcess.on('close', (code, signal) => {
        settle(() => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(
            attachDiagnostic(new Error(`youtube-dl exited with code ${code}`), {
              exitCode: code,
              killed: downloadProcess.killed,
              reason: detectDiagnosticReason(stderrTail()),
              signal,
              stderrTail: stderrTail(),
              stdoutTail: stdoutTail(),
              tool: 'yt-dlp',
            }),
          );
        });
      });
    });
  }
}

/** stream 마지막 일부를 line 단위로 보관한다. */
function createStreamTail(stream: Readable | undefined) {
  /** 지금까지 받은 마지막 line 목록. */
  const lines: string[] = [];

  stream?.on('data', (chunk: Buffer | string) => {
    /** stream chunk를 문자열 line으로 변환한다. */
    const chunkLines = String(chunk).split(/\r?\n/).filter(Boolean);

    lines.push(...chunkLines);

    if (lines.length > DIAGNOSTIC_TAIL_LINES) {
      lines.splice(0, lines.length - DIAGNOSTIC_TAIL_LINES);
    }
  });

  return () => lines.join('\n');
}

/** stderr에서 알려진 YouTube 인증 실패를 분류한다. */
function detectDiagnosticReason(stderrTail: string) {
  if (
    stderrTail.includes('Sign in to confirm you') ||
    stderrTail.includes('LOGIN_REQUIRED')
  ) {
    return 'youtube-auth-required' as const;
  }

  return undefined;
}

/** Error에 client와 분리된 server-only diagnostic을 붙인다. */
function attachDiagnostic(error: Error, diagnostic: DownloaderDiagnostic) {
  return Object.assign(error, { diagnostic });
}
