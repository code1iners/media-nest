import { Test, TestingModule } from '@nestjs/testing';
import { MediaDownloadService } from '../media/media-download.service';
import { AudioMediaRequest } from '../media/media-request.model';
import { AudioService } from './audio.service';

describe('AudioService', () => {
  let service: AudioService;
  const mediaDownloadServiceMock = {
    download: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AudioService,
        {
          provide: MediaDownloadService,
          useValue: mediaDownloadServiceMock,
        },
      ],
    }).compile();

    service = module.get<AudioService>(AudioService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates an mp3 download job with an explicit bitrate format', async () => {
    /** 검증된 오디오 요청 객체. */
    const request: AudioMediaRequest = {
      bitrate: 320,
      filename: 'sample audio',
      source: {
        kind: 'url',
        safeLabel: 'https://www.youtube.com',
        url: 'https://www.youtube.com/watch?v=abc123_DEF0',
      },
    };

    await service.getAudio(request);

    expect(mediaDownloadServiceMock.download).toHaveBeenCalledWith({
      audioFormat: 'mp3',
      contentType: 'audio/mpeg',
      downloadName: 'sample audio.mp3',
      extractAudio: true,
      failureMessage: 'Error generating audio file',
      format: 'bestaudio[abr<=320]/best',
      kind: 'audio',
      source: request.source,
    });
  });

  it('creates an mp3 download job with the default audio format', async () => {
    /** 검증된 오디오 요청 객체. */
    const request: AudioMediaRequest = {
      filename: 'sample audio',
      source: {
        kind: 'youtube-id',
        safeLabel: 'youtube:abc123_DEF0',
        url: 'https://www.youtube.com/watch?v=abc123_DEF0',
      },
    };

    await service.getAudio(request);

    expect(mediaDownloadServiceMock.download).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'bestaudio/best',
      }),
    );
  });
});
