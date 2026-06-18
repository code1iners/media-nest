import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { Response } from 'express';
import { exec as youtubeExec } from 'youtube-dl-exec';
import { AudioService } from './audio.service';

jest.mock('youtube-dl-exec', () => ({
  exec: jest.fn(),
}));

describe('AudioService', () => {
  let service: AudioService;
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
        AudioService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('/usr/bin/ffmpeg'),
          },
        },
      ],
    }).compile();

    service = module.get<AudioService>(AudioService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('sends extracted audio as an mp3 download', () => {
    const response = createResponseMock();

    service.getAudio(
      {
        bitrate: '320',
        filename: 'sample audio',
        url: 'https://www.youtube.com/watch?v=abc123_DEF0',
      },
      response,
    );
    downloadProcess.emit('close', 0);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'audio/mpeg',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      "attachment; filename*=UTF-8''sample%20audio.mp3",
    );
    expect(youtubeExecMock).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123_DEF0',
      expect.objectContaining({
        audioFormat: 'mp3',
        extractAudio: true,
        format: 'bestaudio[abr<=320]/best',
        output: expect.stringMatching(/sample%20audio\.mp3$/),
      }),
    );
    expect(response.sendFile).toHaveBeenCalledWith(
      expect.stringMatching(/sample%20audio\.mp3$/),
      expect.any(Function),
    );
  });

  it('rejects invalid audio urls before starting a download', () => {
    const response = createResponseMock();

    expect(() => service.getAudio({ url: 'not-a-url' }, response)).toThrow(
      'url must be a valid URL',
    );
    expect(youtubeExecMock).not.toHaveBeenCalled();
  });
});
