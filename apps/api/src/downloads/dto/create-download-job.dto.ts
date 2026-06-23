import { MediaKind } from '../../media/media-request.model';

/** 다운로드 job 생성 입력. */
export type CreateDownloadJobDto = {
  /** 다운로드 종류. */
  type?: MediaKind;
  /** 다운로드할 원본 URL. */
  url?: string;
  /** 선택 파일명. */
  filename?: string;
  /** 오디오 bitrate 또는 비디오 resolution. */
  quality?: number | string;
};
