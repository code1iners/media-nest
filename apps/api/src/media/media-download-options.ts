import { MediaKind } from './media-request.model';

/** downloader adapter에 전달하는 공통 실행 옵션. */
export type MediaDownloaderOptions = {
  /** 미디어 다운로드 종류. */
  kind: MediaKind;
  /** downloader가 가져올 정규화된 URL. */
  sourceUrl: string;
  /** downloader가 생성할 결과 파일 경로. */
  outputPath: string;
  /** yt-dlp format selector. */
  format: string;
  /** ffmpeg 실행 파일 경로. */
  ffmpegLocation?: string;
  /** 요청 취소 신호. */
  signal?: AbortSignal;
  /** 오디오 추출 여부. */
  extractAudio?: boolean;
  /** 오디오 추출 포맷. */
  audioFormat?: 'mp3';
  /** 비디오 병합 결과 포맷. */
  mergeOutputFormat?: 'mp4';
};
