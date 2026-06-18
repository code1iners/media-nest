import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { exec as youtubeExec } from 'youtube-dl-exec';
import { YoutubeDlMediaDownloader } from './youtube-dl-media-downloader';

jest.mock('youtube-dl-exec', () => ({
  exec: jest.fn(),
}));

describe('YoutubeDlMediaDownloader', () => {
  let downloader: YoutubeDlMediaDownloader;
  let downloadProcess: EventEmitter & { kill: jest.Mock };

  const youtubeExecMock = jest.mocked(youtubeExec);

  beforeEach(() => {
    jest.clearAllMocks();

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
        output: '/tmp/sample.mp3',
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
