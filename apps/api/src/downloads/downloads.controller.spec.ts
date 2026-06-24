import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DownloadsController } from './downloads.controller';
import { DownloadsService } from './downloads.service';

describe('DownloadsController', () => {
  let controller: DownloadsController;

  /** downloads service mock. */
  const downloadsServiceMock = {
    create: jest.fn(),
    get: jest.fn(),
    getFile: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    downloadsServiceMock.create.mockResolvedValue({
      createdAt: '2026-06-24T05:32:00.000Z',
      displayStatus: 'queued',
      downloadUrl: null,
      errorCode: null,
      jobId: 'job-1',
      message: '요청이 접수되어 대기 중입니다.',
      progress: 0,
      quality: '192',
      retentionDays: 7,
      status: 'queued',
      type: 'audio',
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DownloadsController],
      providers: [
        {
          provide: DownloadsService,
          useValue: downloadsServiceMock,
        },
      ],
    }).compile();

    controller = module.get<DownloadsController>(DownloadsController);
  });

  it('creates a download job through the DB-backed service', async () => {
    /** 다운로드 job 생성 응답. */
    const response = await controller.createDownloadJob({
      quality: '192',
      type: 'audio',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });

    expect(downloadsServiceMock.create).toHaveBeenCalledWith({
      quality: '192',
      type: 'audio',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    expect(response).toMatchObject({
      displayStatus: 'queued',
      downloadUrl: null,
      jobId: 'job-1',
      status: 'queued',
    });
  });

  it('passes validation failures through', async () => {
    downloadsServiceMock.create.mockRejectedValueOnce(
      new BadRequestException('url must be a valid YouTube URL'),
    );

    await expect(
      controller.createDownloadJob({
        type: 'audio',
        url: 'not-a-url',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns a stored job status', async () => {
    downloadsServiceMock.get.mockResolvedValueOnce({
      createdAt: '2026-06-24T05:32:00.000Z',
      displayStatus: 'processing',
      downloadUrl: null,
      errorCode: null,
      jobId: 'job-1',
      message: '파일을 추출 중입니다. 잠시만 기다려 주세요.',
      progress: 50,
      quality: '192',
      retentionDays: 7,
      status: 'processing',
      type: 'audio',
    });

    await expect(controller.getDownloadJob('job-1')).resolves.toMatchObject({
      displayStatus: 'processing',
      jobId: 'job-1',
      progress: 50,
    });
  });

  it('returns a stored job file stream', async () => {
    downloadsServiceMock.getFile.mockResolvedValueOnce({
      contentDisposition:
        'attachment; filename="audio-192.mp3"; filename*=UTF-8\'\'audio-192.mp3',
      contentType: 'audio/mpeg',
      stream: {
        pipe: jest.fn(),
      },
    });

    /** 다운로드 파일 응답. */
    const response = await controller.getDownloadFile('job-1');

    expect(downloadsServiceMock.getFile).toHaveBeenCalledWith('job-1');
    expect(response).toBeDefined();
  });

  it('returns 404 for unknown jobs', async () => {
    downloadsServiceMock.get.mockRejectedValueOnce(
      new NotFoundException('Download job not found'),
    );

    await expect(controller.getDownloadJob('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
