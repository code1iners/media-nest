import { Injectable } from '@nestjs/common';
import { MediaDownloadService } from '../media/media-download.service';
import {
  MediaDownloadArtifact,
  MediaDownloadJob,
} from '../media/media-download.types';
import { AudioMediaRequest } from '../media/media-request.model';

@Injectable()
export class AudioService {
  constructor(private readonly mediaDownloadService: MediaDownloadService) {}

  /** 검증된 오디오 요청을 공통 다운로드 job 입력으로 변환한다. */
  createAudioDownloadJob(request: AudioMediaRequest): MediaDownloadJob {
    /** 오디오 비트레이트 제한을 반영한 yt-dlp format selector. */
    const format = request.bitrate
      ? `bestaudio[abr<=${request.bitrate}]/best`
      : 'bestaudio/best';

    return {
      audioFormat: 'mp3',
      contentType: 'audio/mpeg',
      downloadName: `${request.filename}.mp3`,
      extractAudio: true,
      failureMessage: 'Error generating audio file',
      format,
      kind: 'audio',
      source: request.source,
    };
  }

  /** 검증된 오디오 요청을 mp3 다운로드 artifact로 생성한다. */
  getAudio(request: AudioMediaRequest): Promise<MediaDownloadArtifact> {
    return this.mediaDownloadService.download(
      this.createAudioDownloadJob(request),
    );
  }
}
