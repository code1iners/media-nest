import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
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
  let downloadProcess: EventEmitter & { kill: jest.Mock; catch?: jest.Mock };

  const youtubeExecMock = jest.mocked(youtubeExec);
  const existsSyncMock = jest.mocked(existsSync);

  beforeEach(() => {
    jest.clearAllMocks();
    existsSyncMock.mockReturnValue(true);

    downloadProcess = Object.assign(new EventEmitter(), {
      kill: jest.fn(),
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
