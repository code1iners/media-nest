import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AudioService } from '../audio/audio.service';
import { MediaDownloadJobService } from '../media/media-download-job.service';
import { VideoService } from '../video/video.service';
import { DownloadsController } from './downloads.controller';

describe('DownloadsController', () => {
  let controller: DownloadsController;

  const audioServiceMock = {
    createAudioDownloadJob: jest.fn(),
  };
  const videoServiceMock = {
    createVideoDownloadJob: jest.fn(),
  };
  const downloadJobServiceMock = {
    cancel: jest.fn(),
    consumeReadyArtifact: jest.fn(),
    create: jest.fn(),
    get: jest.fn(),
  };

  function createResponseMock() {
    return {
      headersSent: false,
      send: jest.fn(),
      sendFile: jest.fn((_path: string, callback: (err?: Error) => void) => {
        callback();
      }),
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    audioServiceMock.createAudioDownloadJob.mockReturnValue({
      contentType: 'audio/mpeg',
      downloadName: 'sample.mp3',
      failureMessage: 'Error generating audio file',
      format: 'bestaudio[abr<=192]/best',
      kind: 'audio',
      source: {
        kind: 'url',
        safeLabel: 'https://example.com',
        url: 'https://example.com/video',
      },
    });
    videoServiceMock.createVideoDownloadJob.mockReturnValue({
      contentType: 'video/mp4',
      downloadName: 'sample.mp4',
      failureMessage: 'Failed generating video file',
      format: 'bestvideo[height<=720]+bestaudio/best',
      kind: 'video',
      source: {
        kind: 'url',
        safeLabel: 'https://example.com',
        url: 'https://example.com/video',
      },
    });
    downloadJobServiceMock.create.mockReturnValue({
      createdAt: '2026-06-23T00:00:00.000Z',
      jobId: 'job-1',
      status: 'queued',
      type: 'audio',
      updatedAt: '2026-06-23T00:00:00.000Z',
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DownloadsController],
      providers: [
        {
          provide: AudioService,
          useValue: audioServiceMock,
        },
        {
          provide: VideoService,
          useValue: videoServiceMock,
        },
        {
          provide: MediaDownloadJobService,
          useValue: downloadJobServiceMock,
        },
      ],
    }).compile();

    controller = module.get<DownloadsController>(DownloadsController);
  });

  it('creates an audio download job', () => {
    /** audio job 생성 응답. */
    const response = controller.createDownloadJob({
      quality: '192',
      type: 'audio',
      url: 'https://example.com/video',
    });

    expect(audioServiceMock.createAudioDownloadJob).toHaveBeenCalledWith(
      expect.objectContaining({
        bitrate: 192,
        source: expect.objectContaining({
          url: 'https://example.com/video',
        }),
      }),
    );
    expect(response).toMatchObject({
      fileUrl: '/downloads/job-1/file',
      jobId: 'job-1',
      status: 'queued',
      statusUrl: '/downloads/job-1',
    });
  });

  it('creates a video download job', () => {
    controller.createDownloadJob({
      quality: '720',
      type: 'video',
      url: 'https://example.com/video',
    });

    expect(videoServiceMock.createVideoDownloadJob).toHaveBeenCalledWith(
      expect.objectContaining({
        resolution: 720,
      }),
    );
  });

  it('rejects invalid URLs before creating a job', () => {
    expect(() =>
      controller.createDownloadJob({
        type: 'audio',
        url: 'not-a-url',
      }),
    ).toThrow(BadRequestException);
    expect(downloadJobServiceMock.create).not.toHaveBeenCalled();
  });

  it('rejects invalid download types', () => {
    expect(() =>
      controller.createDownloadJob({
        type: 'image' as never,
        url: 'https://example.com/video',
      }),
    ).toThrow(BadRequestException);
  });

  it('passes queue limit errors through as 429 responses', () => {
    downloadJobServiceMock.create.mockImplementationOnce(() => {
      throw new HttpException(
        'Download queue is full',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    });

    expect(() =>
      controller.createDownloadJob({
        type: 'audio',
        url: 'https://example.com/video',
      }),
    ).toThrow(HttpException);
  });

  it('returns a stored job status', () => {
    downloadJobServiceMock.get.mockReturnValueOnce({
      createdAt: '2026-06-23T00:00:00.000Z',
      jobId: 'job-1',
      status: 'running',
      type: 'audio',
      updatedAt: '2026-06-23T00:00:01.000Z',
    });

    expect(controller.getDownloadJob('job-1')).toMatchObject({
      jobId: 'job-1',
      status: 'running',
    });
  });

  it('returns 404 for unknown jobs', () => {
    downloadJobServiceMock.get.mockImplementationOnce(() => {
      throw new NotFoundException('Download job not found');
    });

    expect(() => controller.getDownloadJob('missing')).toThrow(
      NotFoundException,
    );
  });

  it('sends a ready file through the shared media delivery helper', async () => {
    /** artifact cleanup 함수. */
    const cleanup = jest.fn();
    /** mock HTTP response. */
    const response = createResponseMock();
    downloadJobServiceMock.consumeReadyArtifact.mockReturnValueOnce({
      cleanup,
      contentType: 'audio/mpeg',
      downloadName: 'sample.mp3',
      filePath: '/tmp/sample.mp3',
      kind: 'audio',
    });

    await controller.downloadReadyFile('job-1', response as never);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'audio/mpeg',
    );
    expect(response.sendFile).toHaveBeenCalledWith(
      '/tmp/sample.mp3',
      expect.any(Function),
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('rejects file requests before the job is ready', async () => {
    downloadJobServiceMock.consumeReadyArtifact.mockImplementationOnce(() => {
      throw new ConflictException('Download job is not ready');
    });

    await expect(
      controller.downloadReadyFile('job-1', createResponseMock() as never),
    ).rejects.toThrow(ConflictException);
  });
});
