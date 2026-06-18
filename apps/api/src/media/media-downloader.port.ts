import { MediaDownloaderOptions } from './media-download-options';

/** media downloader Nest provider token. */
export const MEDIA_DOWNLOADER = Symbol('MEDIA_DOWNLOADER');

/** 외부 downloader 구현체가 지켜야 하는 실행 포트. */
export interface MediaDownloader {
  /** 다운로드 프로세스를 실행하고 결과 파일 생성을 기다린다. */
  download(options: MediaDownloaderOptions): Promise<void>;
}
