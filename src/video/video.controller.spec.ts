import { Test, TestingModule } from '@nestjs/testing';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';

describe('VideoController', () => {
  let controller: VideoController;
  const videoServiceMock = {
    getVideo: jest.fn(),
  };

  function createResponseMock() {
    return {
      headersSent: false,
      sendFile: jest.fn((path: string, callback: (err?: Error) => void) => {
        callback();
      }),
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideoController],
      providers: [
        {
          provide: VideoService,
          useValue: videoServiceMock,
        },
      ],
    }).compile();

    controller = module.get<VideoController>(VideoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates URL video requests to the video service', async () => {
    const response = createResponseMock();
    const input = {
      filename: 'sample',
      resolution: '720',
      url: 'https://example.com/video',
    };
    videoServiceMock.getVideo.mockResolvedValue({
      cleanup: jest.fn(),
      contentType: 'video/mp4',
      downloadName: 'sample.mp4',
      filePath: '/tmp/sample.mp4',
      kind: 'video',
    });

    await controller.getVideo(input, response as never);

    expect(videoServiceMock.getVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'sample',
        resolution: 720,
        source: expect.objectContaining({
          url: 'https://example.com/video',
        }),
      }),
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'video/mp4',
    );
  });

  it('delegates YouTube id video requests to the video service', async () => {
    const response = createResponseMock();
    const input = {
      filename: 'sample',
      resolution: '720',
    };
    videoServiceMock.getVideo.mockResolvedValue({
      cleanup: jest.fn(),
      contentType: 'video/mp4',
      downloadName: 'sample.mp4',
      filePath: '/tmp/sample.mp4',
      kind: 'video',
    });

    await controller.getVideoById('abc123_DEF0', input, response as never);

    expect(videoServiceMock.getVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'sample',
        resolution: 720,
        source: expect.objectContaining({
          kind: 'youtube-id',
          url: 'https://www.youtube.com/watch?v=abc123_DEF0',
        }),
      }),
    );
  });
});
