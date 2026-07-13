import { ConfigService } from '@nestjs/config';
import { runYoutubeDl } from '@mytube-extract/media-downloader';
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

jest.mock('@mytube-extract/media-downloader', () => ({
  runYoutubeDl: jest.fn(),
}));

describe('YoutubeDlMediaDownloader', () => {
  /** API downloader adapter. */
  let downloader: YoutubeDlMediaDownloader;
  /** injected yt-dlp runner mock. */
  const runYoutubeDlMock = jest.mocked(runYoutubeDl);
  /** original yt-dlp process starter. */
  const youtubeExecMock = jest.mocked(youtubeExec);
  /** configured ffmpeg path existence check. */
  const existsSyncMock = jest.mocked(existsSync);

  beforeEach(() => {
    jest.clearAllMocks();
    existsSyncMock.mockReturnValue(true);
    runYoutubeDlMock.mockResolvedValue();

    downloader = new YoutubeDlMediaDownloader({
      get: jest.fn().mockReturnValue('/usr/bin/ffmpeg'),
    } as unknown as ConfigService);
  });

  it('delegates one audio download attempt without ignoreErrors', async () => {
    await expect(
      downloader.download({
        audioFormat: 'mp3',
        extractAudio: true,
        format: 'bestaudio/best',
        kind: 'audio',
        outputPath: '/tmp/sample.mp3',
        sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
      }),
    ).resolves.toBeUndefined();

    expect(runYoutubeDlMock).toHaveBeenCalledTimes(1);
    expect(runYoutubeDlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        execute: youtubeExecMock,
        outputPath: '/tmp/sample.mp3',
        sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
        youtubeOptions: expect.objectContaining({
          addMetadata: true,
          audioFormat: 'mp3',
          extractAudio: true,
          ffmpegLocation: '/usr/bin/ffmpeg',
          format: 'bestaudio/best',
          jsRuntimes: 'node',
          output: '/tmp/sample.mp3',
        }),
      }),
    );
    expect(
      runYoutubeDlMock.mock.calls[0]?.[0].youtubeOptions,
    ).not.toHaveProperty('ignoreErrors');
  });

  it('omits a configured ffmpeg path that does not exist locally', async () => {
    existsSyncMock.mockReturnValue(false);

    await downloader.download({
      format: 'bestvideo+bestaudio/best',
      kind: 'video',
      mergeOutputFormat: 'mp4',
      outputPath: '/tmp/sample.mp4',
      sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
    });

    expect(runYoutubeDlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        youtubeOptions: expect.not.objectContaining({
          ffmpegLocation: '/usr/bin/ffmpeg',
        }),
      }),
    );
  });

  it('forwards abort signals to the shared runner without adding API retries', async () => {
    /** API request cancellation signal. */
    const abortController = new AbortController();

    await downloader.download({
      format: 'bestaudio/best',
      kind: 'audio',
      outputPath: '/tmp/sample.mp3',
      signal: abortController.signal,
      sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
    });

    expect(runYoutubeDlMock).toHaveBeenCalledTimes(1);
    expect(runYoutubeDlMock).toHaveBeenCalledWith(
      expect.objectContaining({ signal: abortController.signal }),
    );
  });
});
