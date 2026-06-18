import { MediaKind, MediaSource } from './media-request.model';

/** 공통 lifecycle이 내려받을 파일을 만들기 위해 받는 입력. */
export type MediaDownloadJob = {
  /** 미디어 다운로드 종류. */
  kind: MediaKind;
  /** 검증된 원본 미디어. */
  source: MediaSource;
  /** 확장자를 포함한 다운로드 파일명. */
  downloadName: string;
  /** HTTP 응답에 설정할 MIME type. */
  contentType: string;
  /** yt-dlp format selector. */
  format: string;
  /** client-facing generic 실패 메시지. */
  failureMessage: string;
  /** 오디오 추출 여부. */
  extractAudio?: boolean;
  /** 오디오 추출 포맷. */
  audioFormat?: 'mp3';
  /** 비디오 병합 결과 포맷. */
  mergeOutputFormat?: 'mp4';
};

/** HTTP boundary가 전송하고 닫아야 하는 다운로드 결과물. */
export type MediaDownloadArtifact = {
  /** 미디어 다운로드 종류. */
  kind: MediaKind;
  /** 응답에 노출할 파일명. */
  downloadName: string;
  /** 생성된 임시 파일 경로. */
  filePath: string;
  /** HTTP 응답에 설정할 MIME type. */
  contentType: string;
  /** 요청 단위 임시 리소스 정리 함수. */
  cleanup: () => void;
};
