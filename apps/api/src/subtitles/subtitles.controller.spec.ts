import {
  BadRequestException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { SubtitlesController } from './subtitles.controller';
import { SubtitlesService } from './subtitles.service';

describe('SubtitlesController', () => {
  let controller: SubtitlesController;
  /** 테스트용 Nest app. */
  let app: INestApplication;

  /** subtitles service mock. */
  const subtitlesServiceMock = {
    abortUpload: jest.fn(),
    completeUpload: jest.fn(),
    create: jest.fn(),
    createUpload: jest.fn(),
    get: jest.fn(),
    getFile: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    subtitlesServiceMock.abortUpload.mockResolvedValue(undefined);
    subtitlesServiceMock.completeUpload.mockResolvedValue({
      createdAt: '2026-07-03T01:00:00.000Z',
      displayStatus: 'queued',
      downloadUrl: null,
      errorCode: null,
      fileName: 'sample-video.mp4',
      jobId: 'job-1',
      message: '요청이 접수되어 대기 중입니다.',
      progress: 10,
      retentionDays: 7,
      stage: 'queued',
      status: 'queued',
      whisperModel: 'base_en',
    });
    subtitlesServiceMock.create.mockResolvedValue({
      createdAt: '2026-07-03T01:00:00.000Z',
      displayStatus: 'queued',
      downloadUrl: null,
      errorCode: null,
      fileName: 'sample-video.mp4',
      jobId: 'job-1',
      message: '요청이 접수되어 대기 중입니다.',
      progress: 10,
      retentionDays: 7,
      stage: 'queued',
      status: 'queued',
      whisperModel: 'base_en',
    });
    subtitlesServiceMock.createUpload.mockResolvedValue({
      expiresAt: '2026-07-03T01:30:00.000Z',
      objectKey: 'subtitles/uploads/session-1/source.mp4',
      partSizeBytes: 67108864,
      parts: [{ partNumber: 1, uploadUrl: 'https://r2.example/part-1' }],
      uploadId: 'upload-1',
      uploadToken: 'token',
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubtitlesController],
      providers: [
        {
          provide: SubtitlesService,
          useValue: subtitlesServiceMock,
        },
      ],
    }).compile();

    controller = module.get<SubtitlesController>(SubtitlesController);
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a direct subtitle upload session through the service', async () => {
    /** direct upload session 생성 요청. */
    const input = {
      contentType: 'video/mp4',
      fileName: 'sample-video.mp4',
      sizeBytes: 5,
      whisperModel: 'base_en' as const,
    };

    await expect(controller.createSubtitleUpload(input)).resolves.toMatchObject(
      {
        objectKey: 'subtitles/uploads/session-1/source.mp4',
        uploadId: 'upload-1',
      },
    );
    expect(subtitlesServiceMock.createUpload).toHaveBeenCalledWith(input);
  });

  it('completes a direct subtitle upload through the service', async () => {
    /** direct upload 완료 요청. */
    const input = {
      objectKey: 'subtitles/uploads/session-1/source.mp4',
      parts: [{ etag: '"etag-1"', partNumber: 1 }],
      uploadId: 'upload-1',
      uploadToken: 'token',
    };

    await expect(
      controller.completeSubtitleUpload(input),
    ).resolves.toMatchObject({
      displayStatus: 'queued',
      jobId: 'job-1',
    });
    expect(subtitlesServiceMock.completeUpload).toHaveBeenCalledWith(input);
  });

  it('aborts a direct subtitle upload through the service', async () => {
    /** direct upload 취소 요청. */
    const input = {
      objectKey: 'subtitles/uploads/session-1/source.mp4',
      uploadId: 'upload-1',
      uploadToken: 'token',
    };

    await expect(controller.abortSubtitleUpload(input)).resolves.toEqual({
      ok: true,
    });
    expect(subtitlesServiceMock.abortUpload).toHaveBeenCalledWith(input);
  });

  it('rejects malformed direct upload session bodies before the service', async () => {
    await request(app.getHttpServer())
      .post('/subtitles/uploads')
      .send({
        contentType: 'video/mp4',
        sizeBytes: 5,
        whisperModel: 'base_en',
      })
      .expect(400);
    expect(subtitlesServiceMock.createUpload).not.toHaveBeenCalled();
  });

  it('rejects malformed direct upload complete bodies before the service', async () => {
    await request(app.getHttpServer())
      .post('/subtitles/uploads/complete')
      .send({
        objectKey: 'subtitles/uploads/session-1/source.mp4',
        parts: [{ etag: '"etag-1"', partNumber: 1 }],
        uploadId: 'upload-1',
      })
      .expect(400);
    expect(subtitlesServiceMock.completeUpload).not.toHaveBeenCalled();
  });

  it('creates a subtitle job through the service', async () => {
    /** 업로드 파일 mock. */
    const file = {
      mimetype: 'video/mp4',
      originalname: 'sample-video.mp4',
      path: '/tmp/sample-video.mp4',
      size: 5,
    };
    /** 자막 job 생성 응답. */
    const response = await controller.createSubtitleJob(file, 'small_en');

    expect(subtitlesServiceMock.create).toHaveBeenCalledWith(file, 'small_en');
    expect(response).toMatchObject({
      displayStatus: 'queued',
      downloadUrl: null,
      jobId: 'job-1',
      status: 'queued',
    });
  });

  it('passes validation failures through', async () => {
    subtitlesServiceMock.create.mockRejectedValueOnce(
      new BadRequestException('file must be mp4, mov, or webm video'),
    );

    await expect(controller.createSubtitleJob(undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns a stored subtitle job status', async () => {
    subtitlesServiceMock.get.mockResolvedValueOnce({
      displayStatus: 'transcribing',
      jobId: 'job-1',
      progress: 70,
      status: 'transcribing',
    });

    await expect(controller.getSubtitleJob('job-1')).resolves.toMatchObject({
      displayStatus: 'transcribing',
      jobId: 'job-1',
      progress: 70,
    });
  });

  it('returns a stored subtitle file stream', async () => {
    subtitlesServiceMock.getFile.mockResolvedValueOnce({
      contentDisposition:
        'attachment; filename="sample.en.srt"; filename*=UTF-8\'\'sample.en.srt',
      contentType: 'application/x-subrip; charset=utf-8',
      stream: {
        pipe: jest.fn(),
      },
    });

    /** 다운로드 파일 응답. */
    const response = await controller.getSubtitleFile('job-1');

    expect(subtitlesServiceMock.getFile).toHaveBeenCalledWith('job-1');
    expect(response).toBeDefined();
  });

  it('returns 404 for unknown subtitle jobs', async () => {
    subtitlesServiceMock.get.mockRejectedValueOnce(
      new NotFoundException('Subtitle job not found'),
    );

    await expect(controller.getSubtitleJob('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
