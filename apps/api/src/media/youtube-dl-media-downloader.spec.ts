import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { PassThrough } from 'stream';
import { exec as youtubeExec } from 'youtube-dl-exec';
import { YoutubeDlMediaDownloader } from './youtube-dl-media-downloader';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
}));

jest.mock('youtube-dl-exec', () => ({
  exec: jest.fn(),
}));

describe('YoutubeDlMediaDownloader', () => {
  let downloader: YoutubeDlMediaDownloader;
  let downloadProcess: EventEmitter & {
    /** 테스트에서 주입하는 child process 종료 함수. */
    kill: jest.Mock;
    /** youtube-dl-exec promise rejection hook. */
    catch?: jest.Mock;
    /** 테스트 stdout stream. */
    stdout: PassThrough;
    /** 테스트 stderr stream. */
    stderr: PassThrough;
  };

  const youtubeExecMock = jest.mocked(youtubeExec);
  const existsSyncMock = jest.mocked(existsSync);

  beforeEach(() => {
    jest.clearAllMocks();
    existsSyncMock.mockReturnValue(true);

    downloadProcess = Object.assign(new EventEmitter(), {
      kill: jest.fn(),
      stderr: new PassThrough(),
      stdout: new PassThrough(),
    });
    youtubeExecMock.mockReturnValue(downloadProcess as never);

    downloader = new YoutubeDlMediaDownloader({
      get: jest.fn().mockReturnValue('/usr/bin/ffmpeg'),
    } as unknown as ConfigService);
  });

  it('runs youtube-dl-exec with audio options and resolves on close code 0', async () => {
    const promise = downloader.download({
      audioFormat: 'mp3',
      extractAudio: true,
      format: 'bestaudio/best',
      kind: 'audio',
      outputPath: '/tmp/sample.mp3',
      sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
    });

    downloadProcess.emit('close', 0);

    await expect(promise).resolves.toBeUndefined();
    expect(youtubeExecMock).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123_DEF0',
      expect.objectContaining({
        audioFormat: 'mp3',
        extractAudio: true,
        ffmpegLocation: '/usr/bin/ffmpeg',
        format: 'bestaudio/best',
        jsRuntimes: 'node',
        output: '/tmp/sample.mp3',
      }),
    );
  });

  it('rejects handled youtube-dl-exec promise failures without crashing', async () => {
    downloadProcess.catch = jest.fn((listener: (error: Error) => void) => {
      listener(new Error('promise failed'));
    });

    const promise = downloader.download({
      format: 'bestaudio/best',
      kind: 'audio',
      outputPath: '/tmp/sample.mp3',
      sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
    });

    downloadProcess.emit('close', 1);

    await expect(promise).rejects.toThrow('promise failed');
  });

  it('omits a configured ffmpeg path that does not exist locally', async () => {
    existsSyncMock.mockReturnValue(false);

    const promise = downloader.download({
      format: 'bestaudio/best',
      kind: 'audio',
      outputPath: '/tmp/sample.mp3',
      sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
    });

    downloadProcess.emit('close', 0);

    await expect(promise).resolves.toBeUndefined();
    expect(youtubeExecMock).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123_DEF0',
      expect.not.objectContaining({
        ffmpegLocation: '/usr/bin/ffmpeg',
      }),
    );
  });

  it('rejects once for duplicate error and close events', async () => {
    const promise = downloader.download({
      format: 'bestvideo+bestaudio/best',
      kind: 'video',
      mergeOutputFormat: 'mp4',
      outputPath: '/tmp/sample.mp4',
      sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
    });

    downloadProcess.emit('error', new Error('upstream failed'));
    downloadProcess.emit('close', 1);

    await expect(promise).rejects.toThrow('upstream failed');
  });

  it('keeps server-only diagnostics when yt-dlp exits with stderr', async () => {
    const promise = downloader.download({
      format: 'bestaudio/best',
      kind: 'audio',
      outputPath: '/tmp/sample.mp3',
      sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
    });

    downloadProcess.stderr.write('first warning\n');
    downloadProcess.stderr.write('ERROR: ffmpeg failed /tmp/private-token\n');
    downloadProcess.stdout.write('download-id-123\n');
    downloadProcess.emit('close', 1, 'SIGTERM');

    await expect(promise).rejects.toMatchObject({
      diagnostic: expect.objectContaining({
        exitCode: 1,
        signal: 'SIGTERM',
        stderrTail: expect.stringContaining('ffmpeg failed'),
        stdoutTail: expect.stringContaining('download-id-123'),
      }),
    });
  });

  it('kills the process when the abort signal fires', async () => {
    const abortController = new AbortController();
    const promise = downloader.download({
      format: 'bestaudio/best',
      kind: 'audio',
      outputPath: '/tmp/sample.mp3',
      signal: abortController.signal,
      sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
    });

    abortController.abort();

    await expect(promise).rejects.toThrow('Media download timed out');
    expect(downloadProcess.kill).toHaveBeenCalledTimes(1);
  });
});
