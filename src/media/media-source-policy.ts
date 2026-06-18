import { BadRequestException } from '@nestjs/common';
import { MediaSource } from './media-request.model';

/** YouTube 영상 ID 형식. */
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** 현재 제품-visible 동작 보존을 위해 허용하는 URL 프로토콜. */
const ALLOWED_SOURCE_PROTOCOLS = new Set(['http:', 'https:']);

/** source URL에서 로그에 남겨도 되는 최소 식별자를 만든다. */
function createSafeSourceLabel(parsedUrl: URL) {
  return `${parsedUrl.protocol}//${parsedUrl.host}`;
}

/** URL 입력을 downloader에 전달 가능한 source로 정규화한다. */
export function createUrlMediaSource(url: string | undefined): MediaSource {
  if (!url) {
    throw new BadRequestException('url is required');
  }

  try {
    const parsedUrl = new URL(url);

    if (!ALLOWED_SOURCE_PROTOCOLS.has(parsedUrl.protocol)) {
      throw new Error('Unsupported protocol');
    }

    return {
      kind: 'url',
      safeLabel: createSafeSourceLabel(parsedUrl),
      url: parsedUrl.toString(),
    };
  } catch {
    throw new BadRequestException('url must be a valid URL');
  }
}

/** YouTube 영상 ID 입력을 watch URL source로 정규화한다. */
export function createYoutubeIdMediaSource(videoId: string): MediaSource {
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    throw new BadRequestException('id must be a valid YouTube video id');
  }

  return {
    kind: 'youtube-id',
    safeLabel: `youtube:${videoId}`,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
