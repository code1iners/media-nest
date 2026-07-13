import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExtractionJobStatus, ExtractionType } from '@mytube-extract/db';
import { DownloadsService } from './downloads.service';

describe('DownloadsService', () => {
  /** Prisma mock. */
  const prismaMock = {
    extractedAsset: {
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    extractionJob: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  /** R2 storage mock. */
  const r2StorageServiceMock = {
    getObjectStream: jest.fn(),
    objectExists: jest.fn(),
  };
  /** config service mock. */
  const configServiceMock = {
    get: jest.fn((key: string) => {
      if (key === 'ASSET_RETENTION_DAYS') {
        return '7';
      }

      return undefined;
    }),
  };
  /** 테스트 대상 service. */
  let service: DownloadsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DownloadsService(
      prismaMock as never,
      configServiceMock as unknown as ConfigService,
      r2StorageServiceMock as never,
    );
  });

  it('creates a queued job when no reusable asset exists', async () => {
    prismaMock.extractedAsset.findFirst.mockResolvedValueOnce(null);
    prismaMock.extractionJob.create.mockResolvedValueOnce({
      asset: null,
      createdAt: new Date('2026-06-24T05:32:00.000Z'),
      errorCode: null,
      id: 'job-1',
      quality: '192',
      status: ExtractionJobStatus.queued,
      type: ExtractionType.audio,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
    });

    await expect(
      service.create({
        quality: '192',
        type: 'audio',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      }),
    ).resolves.toMatchObject({
      displayStatus: 'queued',
      downloadUrl: null,
      progress: 0,
      status: 'queued',
    });
    expect(prismaMock.extractionJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quality: '192',
          status: ExtractionJobStatus.queued,
          videoId: 'dQw4w9WgXcQ',
        }),
      }),
    );
  });

  it('stores a canonical YouTube URL instead of input query credentials', async () => {
    prismaMock.extractedAsset.findFirst.mockResolvedValueOnce(null);
    prismaMock.extractionJob.create.mockResolvedValueOnce({
      asset: null,
      createdAt: new Date('2026-06-24T05:32:00.000Z'),
      errorCode: null,
      id: 'job-1',
      quality: '1080',
      status: ExtractionJobStatus.queued,
      type: ExtractionType.video,
      url: 'https://www.youtube.com/watch?v=rc5pL5-nS1o',
      videoId: 'rc5pL5-nS1o',
    });

    await service.create({
      quality: '1080',
      type: 'video',
      url: 'https://youtu.be/rc5pL5-nS1o?si=private-share-token&token=secret',
    });

    expect(prismaMock.extractionJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          url: 'https://www.youtube.com/watch?v=rc5pL5-nS1o',
          videoId: 'rc5pL5-nS1o',
        }),
      }),
    );
  });

  it('normalizes missing audio quality to 320', async () => {
    prismaMock.extractedAsset.findFirst.mockResolvedValueOnce(null);
    prismaMock.extractionJob.create.mockResolvedValueOnce({
      asset: null,
      createdAt: new Date('2026-06-24T05:32:00.000Z'),
      errorCode: null,
      id: 'job-1',
      quality: '320',
      status: ExtractionJobStatus.queued,
      type: ExtractionType.audio,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
    });

    await service.create({
      type: 'audio',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });

    expect(prismaMock.extractionJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quality: '320',
        }),
      }),
    );
  });

  it('normalizes legacy default video quality to 1080', async () => {
    prismaMock.extractedAsset.findFirst.mockResolvedValueOnce(null);
    prismaMock.extractionJob.create.mockResolvedValueOnce({
      asset: null,
      createdAt: new Date('2026-06-24T05:32:00.000Z'),
      errorCode: null,
      id: 'job-1',
      quality: '1080',
      status: ExtractionJobStatus.queued,
      type: ExtractionType.video,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
    });

    await service.create({
      quality: 'default',
      type: 'video',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });

    expect(prismaMock.extractionJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quality: '1080',
        }),
      }),
    );
  });

  it('creates a completed job when a reusable asset exists', async () => {
    prismaMock.extractedAsset.findFirst.mockResolvedValueOnce({
      expiresAt: new Date('2099-07-08T05:32:00.000Z'),
      id: 'asset-1',
      objectKey: 'extracts/dQw4w9WgXcQ/audio-192.mp3',
    });
    r2StorageServiceMock.objectExists.mockResolvedValueOnce(true);
    prismaMock.extractionJob.create.mockResolvedValueOnce({
      asset: {
        expiresAt: new Date('2099-07-08T05:32:00.000Z'),
        id: 'asset-1',
        objectKey: 'extracts/dQw4w9WgXcQ/audio-192.mp3',
        title: 'Never Gonna Give You Up',
      },
      createdAt: new Date('2026-06-24T05:32:00.000Z'),
      errorCode: null,
      id: 'job-1',
      quality: '192',
      status: ExtractionJobStatus.completed,
      type: ExtractionType.audio,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
    });

    await expect(
      service.create({
        quality: '192',
        type: 'audio',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      }),
    ).resolves.toMatchObject({
      displayStatus: 'completed',
      downloadUrl: '/downloads/job-1/file',
      progress: 100,
      status: 'completed',
    });
  });

  it('does not reuse stale asset rows when the object is missing', async () => {
    prismaMock.extractedAsset.findFirst.mockResolvedValueOnce({
      expiresAt: new Date('2099-07-08T05:32:00.000Z'),
      id: 'asset-1',
      objectKey: 'extracts/rc5pL5-nS1o/audio-320.mp3',
    });
    r2StorageServiceMock.objectExists.mockResolvedValueOnce(false);
    prismaMock.extractedAsset.delete.mockResolvedValueOnce({
      id: 'asset-1',
    });
    prismaMock.extractionJob.create.mockResolvedValueOnce({
      asset: null,
      createdAt: new Date('2026-06-24T05:32:00.000Z'),
      errorCode: null,
      id: 'job-1',
      quality: '320',
      status: ExtractionJobStatus.queued,
      type: ExtractionType.audio,
      url: 'https://youtu.be/rc5pL5-nS1o?si=7pDRw7b-gaWWc9Qm',
      videoId: 'rc5pL5-nS1o',
    });

    await expect(
      service.create({
        quality: '320',
        type: 'audio',
        url: 'https://youtu.be/rc5pL5-nS1o?si=7pDRw7b-gaWWc9Qm',
      }),
    ).resolves.toMatchObject({
      displayStatus: 'queued',
      downloadUrl: null,
      progress: 0,
      status: 'queued',
    });
    expect(prismaMock.extractedAsset.delete).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
    });
    expect(prismaMock.extractionJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assetId: undefined,
          status: ExtractionJobStatus.queued,
        }),
      }),
    );
  });

  it('returns an attachment file stream for completed jobs', async () => {
    /** R2 object stream mock. */
    const stream = { pipe: jest.fn() };

    prismaMock.extractionJob.findUnique.mockResolvedValueOnce({
      asset: {
        expiresAt: new Date('2099-07-08T05:32:00.000Z'),
        id: 'asset-1',
        objectKey: 'extracts/dQw4w9WgXcQ/audio-192.mp3',
        title: 'Never Gonna Give You Up',
      },
      createdAt: new Date('2026-06-24T05:32:00.000Z'),
      errorCode: null,
      id: 'job-1',
      quality: '192',
      status: ExtractionJobStatus.completed,
      type: ExtractionType.audio,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
    });
    r2StorageServiceMock.getObjectStream.mockResolvedValueOnce(stream);

    await expect(service.getFile('job-1')).resolves.toMatchObject({
      contentDisposition:
        'attachment; filename="Never Gonna Give You Up.mp3"; filename*=UTF-8\'\'Never%20Gonna%20Give%20You%20Up.mp3',
      contentType: 'audio/mpeg',
      stream,
    });
    expect(r2StorageServiceMock.getObjectStream).toHaveBeenCalledWith(
      'extracts/dQw4w9WgXcQ/audio-192.mp3',
    );
  });

  it('falls back to the object key file name when a completed asset has no title', async () => {
    /** R2 object stream mock. */
    const stream = { pipe: jest.fn() };

    prismaMock.extractionJob.findUnique.mockResolvedValueOnce({
      asset: {
        expiresAt: new Date('2099-07-08T05:32:00.000Z'),
        id: 'asset-1',
        objectKey: 'extracts/dQw4w9WgXcQ/audio-192.mp3',
        title: null,
      },
      createdAt: new Date('2026-06-24T05:32:00.000Z'),
      errorCode: null,
      id: 'job-1',
      quality: '192',
      status: ExtractionJobStatus.completed,
      type: ExtractionType.audio,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
    });
    r2StorageServiceMock.getObjectStream.mockResolvedValueOnce(stream);

    await expect(service.getFile('job-1')).resolves.toMatchObject({
      contentDisposition:
        'attachment; filename="audio-192.mp3"; filename*=UTF-8\'\'audio-192.mp3',
      contentType: 'audio/mpeg',
      stream,
    });
  });

  it('percent-encodes RFC 5987 reserved characters in title download names', async () => {
    /** R2 object stream mock. */
    const stream = { pipe: jest.fn() };

    prismaMock.extractionJob.findUnique.mockResolvedValueOnce({
      asset: {
        expiresAt: new Date('2099-07-08T05:32:00.000Z'),
        id: 'asset-1',
        objectKey: 'extracts/dQw4w9WgXcQ/audio-192.mp3',
        title: "Rock'n Roll (Live)",
      },
      createdAt: new Date('2026-06-24T05:32:00.000Z'),
      errorCode: null,
      id: 'job-1',
      quality: '192',
      status: ExtractionJobStatus.completed,
      type: ExtractionType.audio,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
    });
    r2StorageServiceMock.getObjectStream.mockResolvedValueOnce(stream);

    await expect(service.getFile('job-1')).resolves.toMatchObject({
      contentDisposition:
        "attachment; filename=\"Rock'n Roll (Live).mp3\"; filename*=UTF-8''Rock%27n%20Roll%20%28Live%29.mp3",
      contentType: 'audio/mpeg',
      stream,
    });
  });

  it('marks completed jobs without assets as expired for the UI', async () => {
    prismaMock.extractionJob.findUnique.mockResolvedValueOnce({
      asset: null,
      createdAt: new Date('2026-06-24T05:32:00.000Z'),
      errorCode: null,
      id: 'job-1',
      quality: '192',
      status: ExtractionJobStatus.completed,
      type: ExtractionType.audio,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
    });

    await expect(service.get('job-1')).resolves.toMatchObject({
      displayStatus: 'expired',
      downloadUrl: null,
      progress: null,
      status: 'completed',
    });
  });

  it('returns failed jobs with an error code', async () => {
    prismaMock.extractionJob.findUnique.mockResolvedValueOnce({
      asset: null,
      createdAt: new Date('2026-06-24T05:32:00.000Z'),
      errorCode: 'EXTRACTION_FAILED',
      id: 'job-1',
      quality: '192',
      status: ExtractionJobStatus.failed,
      type: ExtractionType.audio,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
    });

    await expect(service.get('job-1')).resolves.toMatchObject({
      displayStatus: 'failed',
      errorCode: 'EXTRACTION_FAILED',
      message: '추출에 실패했습니다. 다시 시도해 주세요.',
      progress: null,
    });
  });

  it('returns a specific message for large video failures', async () => {
    prismaMock.extractionJob.findUnique.mockResolvedValueOnce({
      asset: null,
      createdAt: new Date('2026-06-24T05:32:00.000Z'),
      errorCode: 'VIDEO_TOO_LARGE',
      id: 'job-1',
      quality: '1080',
      status: ExtractionJobStatus.failed,
      type: ExtractionType.video,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
    });

    await expect(service.get('job-1')).resolves.toMatchObject({
      displayStatus: 'failed',
      errorCode: 'VIDEO_TOO_LARGE',
      message:
        '파일 크기가 커서 현재 설정으로 처리할 수 없습니다. 낮은 화질로 다시 시도해 주세요.',
      progress: null,
    });
  });

  it('rejects non-YouTube URLs', async () => {
    await expect(
      service.create({
        type: 'audio',
        url: 'https://example.com/video',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns 404 for missing jobs', async () => {
    prismaMock.extractionJob.findUnique.mockResolvedValueOnce(null);

    await expect(service.get('missing')).rejects.toThrow(NotFoundException);
  });
});
