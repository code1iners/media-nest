import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { Response } from 'express';
import { exec as youtubeExec } from 'youtube-dl-exec';
import { VideoService } from './video.service';

jest.mock('youtube-dl-exec', () => ({
  exec: jest.fn(),
}));

describe('VideoService', () => {
  let service: VideoService;
  let downloadProcess: EventEmitter;

  const youtubeExecMock = jest.mocked(youtubeExec);

  function createResponseMock() {
    return {
      headersSent: false,
      sendFile: jest.fn((path: string, callback: (err?: Error) => void) => {
        callback();
      }),
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as unknown as Response & {
      sendFile: jest.Mock;
      setHeader: jest.Mock;
      status: jest.Mock;
      send: jest.Mock;
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    downloadProcess = new EventEmitter();
    youtubeExecMock.mockReturnValue(downloadProcess as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('/usr/bin/ffmpeg'),
          },
        },
      ],
    }).compile();

    service = module.get<VideoService>(VideoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('sends merged video as an mp4 download', () => {
    const response = createResponseMock();

    service.getVideoById(
      'abc123_DEF0',
      {
        filename: 'sample video',
        resolution: '720',
      },
      response,
    );
    downloadProcess.emit('close', 0);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'video/mp4',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      "attachment; filename*=UTF-8''sample%20video.mp4",
    );
    expect(youtubeExecMock).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123_DEF0',
      expect.objectContaining({
        format: 'bestvideo[height<=720]+bestaudio/best',
        mergeOutputFormat: 'mp4',
        output: expect.stringMatching(/sample%20video\.mp4$/),
      }),
    );
    expect(response.sendFile).toHaveBeenCalledWith(
      expect.stringMatching(/sample%20video\.mp4$/),
      expect.any(Function),
    );
  });

  it('rejects invalid resolutions before starting a download', () => {
    const response = createResponseMock();

    expect(() =>
      service.getVideoById('abc123_DEF0', { resolution: '0' }, response),
    ).toThrow('resolution must be a positive integer');
    expect(youtubeExecMock).not.toHaveBeenCalled();
  });
});
