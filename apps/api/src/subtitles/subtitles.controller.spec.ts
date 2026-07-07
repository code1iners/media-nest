import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SubtitlesController } from './subtitles.controller';
import { SubtitlesService } from './subtitles.service';

describe('SubtitlesController', () => {
  let controller: SubtitlesController;

  /** subtitles service mock. */
  const subtitlesServiceMock = {
    create: jest.fn(),
    get: jest.fn(),
    getFile: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
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
