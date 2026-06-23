import {
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { existsSync } from 'fs';
import { MediaDownloadPolicy } from './media-download-policy';
import { MediaDownloadService } from './media-download.service';
import { MEDIA_DOWNLOADER, MediaDownloader } from './media-downloader.port';
import { MediaDownloadJob } from './media-download.types';

describe('MediaDownloadService', () => {
  let service: MediaDownloadService;
  const downloaderMock: jest.Mocked<MediaDownloader> = {
    download: jest.fn(),
  };
  const policyMock = {
    getConfig: jest.fn(),
  };
  const baseJob: MediaDownloadJob = {
    contentType: 'audio/mpeg',
    downloadName: 'sample.mp3',
    failureMessage: 'Error generating audio file',
    format: 'bestaudio/best',
    kind: 'audio',
    source: {
      kind: 'youtube-id',
      safeLabel: 'youtube:abc123_DEF0',
      url: 'https://www.youtube.com/watch?v=abc123_DEF0',
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    downloaderMock.download.mockResolvedValue();
    policyMock.getConfig.mockReturnValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaDownloadService,
        {
          provide: MEDIA_DOWNLOADER,
          useValue: downloaderMock,
        },
        {
          provide: MediaDownloadPolicy,
          useValue: policyMock,
        },
      ],
    }).compile();

    service = module.get<MediaDownloadService>(MediaDownloadService);
  });

  it('creates a downloadable artifact and leaves cleanup ownership to the caller', async () => {
    const artifact = await service.download(baseJob);

    expect(downloaderMock.download).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'bestaudio/best',
        outputPath: expect.stringMatching(/sample\.mp3$/),
        sourceUrl: baseJob.source.url,
      }),
    );
    expect(existsSync(artifact.filePath.replace(/sample\.mp3$/, ''))).toBe(
      true,
    );

    artifact.cleanup();

    expect(existsSync(artifact.filePath.replace(/sample\.mp3$/, ''))).toBe(
      false,
    );
  });

  it('cleans the work directory and returns a generic failure when downloader fails', async () => {
    downloaderMock.download.mockRejectedValueOnce(
      new Error('/tmp/mytube-extract-secret/upstream stderr'),
    );

    await expect(service.download(baseJob)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('logs server-only downloader diagnostics without changing the client failure', async () => {
    /** Nest logger error spy. */
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    /** downloader diagnostic이 붙은 실패. */
    const failure = Object.assign(new Error('/tmp/private/raw stderr'), {
      diagnostic: {
        exitCode: 1,
        stderrTail: 'ERROR: token=secret-value failed at /tmp/private/file.mp3',
        tool: 'yt-dlp',
      },
    });

    downloaderMock.download.mockRejectedValueOnce(failure);

    await expect(service.download(baseJob)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    /** 실제 server log 문자열. */
    const logMessage = String(loggerError.mock.calls[0]?.[0] ?? '');

    expect(logMessage).toContain('tool=yt-dlp');
    expect(logMessage).toContain('exitCode=1');
    expect(logMessage).not.toContain('/tmp/private');
    expect(logMessage).not.toContain('secret-value');

    loggerError.mockRestore();
  });

  it('returns a client-safe YouTube auth message for auth-required diagnostics', async () => {
    /** YouTube bot/auth 감지 diagnostic이 붙은 실패. */
    const failure = Object.assign(new Error('youtube auth required'), {
      diagnostic: {
        reason: 'youtube-auth-required',
        stderrTail: 'Sign in to confirm you’re not a bot',
        tool: 'yt-dlp',
      },
    });

    downloaderMock.download.mockRejectedValueOnce(failure);

    await expect(service.download(baseJob)).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'YouTube 인증 확인이 필요해 다운로드에 실패했습니다.',
      }),
    });
  });

  it('rejects before running the downloader when the concurrency limit is reached', async () => {
    /** 첫 번째 다운로드를 pending 상태로 유지하는 resolver. */
    let resolveFirstDownload: () => void;
    policyMock.getConfig.mockReturnValue({ concurrencyLimit: 1 });
    downloaderMock.download.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstDownload = resolve;
        }),
    );

    /** 제한 슬롯을 점유하는 첫 번째 다운로드. */
    const firstDownload = service.download(baseJob);

    await expect(service.download(baseJob)).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(service.download(baseJob)).rejects.toMatchObject({
      status: 429,
    });
    expect(downloaderMock.download).toHaveBeenCalledTimes(1);

    resolveFirstDownload();
    const artifact = await firstDownload;
    artifact.cleanup();
  });

  it('passes an abort signal when timeout policy is configured', async () => {
    policyMock.getConfig.mockReturnValue({ timeoutMs: 1000 });

    await service.download(baseJob);

    expect(downloaderMock.download).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
