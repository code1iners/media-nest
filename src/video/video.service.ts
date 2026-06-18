import { Injectable } from '@nestjs/common';
import { MediaDownloadService } from '../media/media-download.service';
import { MediaDownloadArtifact } from '../media/media-download.types';
import { VideoMediaRequest } from '../media/media-request.model';

@Injectable()
export class VideoService {
  constructor(private readonly mediaDownloadService: MediaDownloadService) {}

  /** 검증된 비디오 요청을 mp4 다운로드 artifact로 생성한다. */
  getVideo(request: VideoMediaRequest): Promise<MediaDownloadArtifact> {
    /** 영상 높이 제한을 반영한 yt-dlp format selector. */
    const format = request.resolution
      ? `bestvideo[height<=${request.resolution}]+bestaudio/best`
      : 'bestvideo+bestaudio/best';

    return this.mediaDownloadService.download({
      contentType: 'video/mp4',
      downloadName: `${request.filename}.mp4`,
      failureMessage: 'Failed generating video file',
      format,
      kind: 'video',
      mergeOutputFormat: 'mp4',
      source: request.source,
    });
  }
}
