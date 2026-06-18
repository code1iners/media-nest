import type { NumericQueryValue } from './media-request.util';

/** 미디어 다운로드 종류. */
export type MediaKind = 'audio' | 'video';

/** 외부 입력이 어떤 형태로 들어왔는지 나타내는 source 종류. */
export type MediaSourceKind = 'url' | 'youtube-id';

/** 검증을 통과한 미디어 원본. */
export type MediaSource = {
  /** 원본 입력 종류. */
  kind: MediaSourceKind;
  /** downloader에 전달할 정규화된 URL. */
  url: string;
  /** 로그에 남겨도 되는 최소 source 정보. */
  safeLabel: string;
};

/** 오디오/비디오 요청에서 공통으로 쓰는 입력. */
export type MediaRequestInput = {
  /** 다운로드 파일명. */
  filename?: string;
};

/** URL 기반 오디오 요청 입력. */
export type AudioUrlRequestInput = MediaRequestInput & {
  /** 오디오를 추출할 원본 URL. */
  url?: string;
  /** 최대 오디오 비트레이트. */
  bitrate?: NumericQueryValue;
};

/** ID 기반 오디오 요청 입력. */
export type AudioIdRequestInput = MediaRequestInput & {
  /** 최대 오디오 비트레이트. */
  bitrate?: NumericQueryValue;
};

/** URL 기반 비디오 요청 입력. */
export type VideoUrlRequestInput = MediaRequestInput & {
  /** 다운로드할 원본 URL. */
  url?: string;
  /** 최대 영상 높이. */
  resolution?: NumericQueryValue;
};

/** ID 기반 비디오 요청 입력. */
export type VideoIdRequestInput = MediaRequestInput & {
  /** 최대 영상 높이. */
  resolution?: NumericQueryValue;
};

/** 검증된 오디오 다운로드 요청. */
export type AudioMediaRequest = {
  /** 검증된 원본 미디어. */
  source: MediaSource;
  /** 확장자를 붙이기 전 다운로드 파일명. */
  filename: string;
  /** 최대 오디오 비트레이트. */
  bitrate?: number;
};

/** 검증된 비디오 다운로드 요청. */
export type VideoMediaRequest = {
  /** 검증된 원본 미디어. */
  source: MediaSource;
  /** 확장자를 붙이기 전 다운로드 파일명. */
  filename: string;
  /** 최대 영상 높이. */
  resolution?: number;
};
