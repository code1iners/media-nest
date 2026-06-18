import { Test, TestingModule } from '@nestjs/testing';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';

describe('AudioController', () => {
  let controller: AudioController;
  const audioServiceMock = {
    getAudio: jest.fn(),
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
      controllers: [AudioController],
      providers: [
        {
          provide: AudioService,
          useValue: audioServiceMock,
        },
      ],
    }).compile();

    controller = module.get<AudioController>(AudioController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates URL audio requests to the audio service', async () => {
    const response = createResponseMock();
    const input = {
      bitrate: '320',
      filename: 'sample',
      url: 'https://example.com/video',
    };
    audioServiceMock.getAudio.mockResolvedValue({
      cleanup: jest.fn(),
      contentType: 'audio/mpeg',
      downloadName: 'sample.mp3',
      filePath: '/tmp/sample.mp3',
      kind: 'audio',
    });

    await controller.getAudio(input, response as never);

    expect(audioServiceMock.getAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        bitrate: 320,
        filename: 'sample',
        source: expect.objectContaining({
          url: 'https://example.com/video',
        }),
      }),
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'audio/mpeg',
    );
  });

  it('delegates YouTube id audio requests to the audio service', async () => {
    const response = createResponseMock();
    const input = {
      filename: 'sample',
    };
    audioServiceMock.getAudio.mockResolvedValue({
      cleanup: jest.fn(),
      contentType: 'audio/mpeg',
      downloadName: 'sample.mp3',
      filePath: '/tmp/sample.mp3',
      kind: 'audio',
    });

    await controller.getAudioById('abc123_DEF0', input, response as never);

    expect(audioServiceMock.getAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'sample',
        source: expect.objectContaining({
          kind: 'youtube-id',
          url: 'https://www.youtube.com/watch?v=abc123_DEF0',
        }),
      }),
    );
  });
});
