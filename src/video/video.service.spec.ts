import { Test, TestingModule } from '@nestjs/testing';
import { MediaDownloadService } from '../media/media-download.service';
import { VideoMediaRequest } from '../media/media-request.model';
import { VideoService } from './video.service';

describe('VideoService', () => {
  let service: VideoService;
  const mediaDownloadServiceMock = {
    download: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoService,
        {
          provide: MediaDownloadService,
          useValue: mediaDownloadServiceMock,
        },
      ],
    }).compile();

    service = module.get<VideoService>(VideoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates an mp4 download job with an explicit resolution format', async () => {
    /** 검증된 비디오 요청 객체. */
    const request: VideoMediaRequest = {
      filename: 'sample video',
      resolution: 720,
      source: {
        kind: 'youtube-id',
        safeLabel: 'youtube:abc123_DEF0',
        url: 'https://www.youtube.com/watch?v=abc123_DEF0',
      },
    };

    await service.getVideo(request);

    expect(mediaDownloadServiceMock.download).toHaveBeenCalledWith({
      contentType: 'video/mp4',
      downloadName: 'sample video.mp4',
      failureMessage: 'Failed generating video file',
      format: 'bestvideo[height<=720]+bestaudio/best',
      kind: 'video',
      mergeOutputFormat: 'mp4',
      source: request.source,
    });
  });

  it('creates an mp4 download job with the default video format', async () => {
    /** 검증된 비디오 요청 객체. */
    const request: VideoMediaRequest = {
      filename: 'sample video',
      source: {
        kind: 'url',
        safeLabel: 'https://www.youtube.com',
        url: 'https://www.youtube.com/watch?v=abc123_DEF0',
      },
    };

    await service.getVideo(request);

    expect(mediaDownloadServiceMock.download).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'bestvideo+bestaudio/best',
      }),
    );
  });
});
