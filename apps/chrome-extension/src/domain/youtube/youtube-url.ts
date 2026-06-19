/** 감지된 YouTube video tab 정보. */
export type YoutubeTabInfo = {
  /** YouTube video ID. */
  videoId: string;
  /** 정규화된 현재 탭 URL. */
  url: string;
};

/** YouTube video ID 형식. */
const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

/** 현재 탭 URL에서 지원 가능한 YouTube video ID를 추출한다. */
export function detectYoutubeVideoId(tabUrl: string | undefined | null): YoutubeTabInfo | null {
  if (!tabUrl) {
    return null;
  }

  try {
    /** 현재 활성 탭 URL. */
    const url = new URL(tabUrl);
    /** 일반 YouTube watch URL의 video ID 후보. */
    const videoId = url.searchParams.get('v');

    if (
      !['www.youtube.com', 'youtube.com'].includes(url.hostname) ||
      url.pathname !== '/watch' ||
      !videoId ||
      !isYoutubeVideoId(videoId)
    ) {
      return null;
    }

    return { videoId, url: url.toString() };
  } catch {
    return null;
  }
}

/** YouTube video ID 형식인지 확인한다. */
export function isYoutubeVideoId(videoId: string | undefined): videoId is string {
  return Boolean(videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId));
}
