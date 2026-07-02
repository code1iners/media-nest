import { BadRequestException } from '@nestjs/common';
import { ExtractionType } from '@mytube-extract/db';
import { DownloadQuality } from './downloads.types';

/** YouTube video ID 형식. */
const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

/** audio 품질 선택지. */
const AUDIO_QUALITIES = new Set<DownloadQuality>(['128', '192', '320']);

/** video 품질 선택지. */
const VIDEO_QUALITIES = new Set<DownloadQuality>(['360', '720', '1080']);

/** audio 요청의 기본 품질. */
const DEFAULT_AUDIO_QUALITY: DownloadQuality = '320';

/** video 요청의 기본 품질. */
const DEFAULT_VIDEO_QUALITY: DownloadQuality = '1080';

/** 외부 입력 URL에서 지원하는 YouTube video ID를 추출한다. */
export function parseYoutubeVideoId(inputUrl: string | undefined) {
  if (!inputUrl) {
    throw new BadRequestException('url must be a valid YouTube URL');
  }

  try {
    /** URL parser를 통과한 사용자 입력 URL. */
    const url = new URL(inputUrl.trim());
    /** 소문자로 정규화한 hostname. */
    const hostname = url.hostname.toLowerCase();

    if (hostname === 'youtu.be') {
      return validateVideoId(url.pathname.split('/').filter(Boolean)[0] ?? '');
    }

    if (hostname === 'youtube.com' || hostname === 'www.youtube.com') {
      if (url.pathname === '/watch') {
        return validateVideoId(url.searchParams.get('v') ?? '');
      }

      if (url.pathname.startsWith('/shorts/')) {
        return validateVideoId(
          url.pathname.split('/').filter(Boolean)[1] ?? '',
        );
      }
    }
  } catch {
    throw new BadRequestException('url must be a valid YouTube URL');
  }

  throw new BadRequestException('url must be a valid YouTube URL');
}

/** 요청 type을 DB enum 값으로 정규화한다. */
export function parseDownloadType(type: string | undefined) {
  if (type === ExtractionType.audio || type === ExtractionType.video) {
    return type;
  }

  throw new BadRequestException('type must be audio or video');
}

/** type별 허용 품질을 정규화한다. */
export function parseDownloadQuality(
  type: ExtractionType,
  quality: string | number | undefined,
): DownloadQuality {
  /** legacy default 또는 누락 입력을 type별 명시 품질로 바꾼다. */
  const normalizedQuality =
    quality === undefined || quality === 'default'
      ? getDefaultQuality(type)
      : (String(quality) as DownloadQuality);
  /** 현재 type에서 허용하는 품질 목록. */
  const allowedQualities =
    type === ExtractionType.audio ? AUDIO_QUALITIES : VIDEO_QUALITIES;

  if (!allowedQualities.has(normalizedQuality)) {
    throw new BadRequestException('quality is not supported');
  }

  return normalizedQuality;
}

/** type별 기본 품질을 반환한다. */
function getDefaultQuality(type: ExtractionType): DownloadQuality {
  return type === ExtractionType.audio
    ? DEFAULT_AUDIO_QUALITY
    : DEFAULT_VIDEO_QUALITY;
}

/** R2 object key를 만든다. */
export function createAssetObjectKey(
  videoId: string,
  type: ExtractionType,
  quality: DownloadQuality | string,
) {
  /** 출력 확장자. */
  const extension = type === ExtractionType.audio ? 'mp3' : 'mp4';

  return `extracts/${videoId}/${type}-${quality}.${extension}`;
}

/** R2 public base URL과 object key를 안전하게 이어 붙인다. */
export function createDownloadUrl(baseUrl: string, objectKey: string) {
  return `${baseUrl.replace(/\/$/, '')}/${objectKey.replace(/^\//, '')}`;
}

/** YouTube video ID 형식을 검증한다. */
function validateVideoId(videoId: string) {
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    throw new BadRequestException('url must be a valid YouTube URL');
  }

  return videoId;
}
