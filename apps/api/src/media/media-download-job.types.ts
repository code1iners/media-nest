import {
  MediaDownloadArtifact,
  MediaDownloadJob,
} from './media-download.types';
import { MediaKind } from './media-request.model';

/** 다운로드 job 상태. */
export type DownloadJobStatus =
  | 'queued'
  | 'running'
  | 'ready'
  | 'failed'
  | 'canceled'
  | 'expired';

/** API에 노출해도 되는 다운로드 job 상태 스냅샷. */
export type DownloadJobSnapshot = {
  /** 다운로드 job ID. */
  jobId: string;
  /** 다운로드 종류. */
  type: MediaKind;
  /** 현재 job 상태. */
  status: DownloadJobStatus;
  /** 생성 시각. */
  createdAt: string;
  /** 마지막 상태 변경 시각. */
  updatedAt: string;
  /** 실패/취소 상태에서 사용자에게 보여줄 메시지. */
  message?: string;
};

/** in-memory queue가 보관하는 다운로드 job record. */
export type DownloadJobRecord = {
  /** 다운로드 job ID. */
  jobId: string;
  /** 다운로드 실행 입력. */
  input: MediaDownloadJob;
  /** 다운로드 종류. */
  type: MediaKind;
  /** 현재 job 상태. */
  status: DownloadJobStatus;
  /** 생성 시각 timestamp. */
  createdAt: number;
  /** 마지막 상태 변경 timestamp. */
  updatedAt: number;
  /** running job 취소 컨트롤러. */
  abortController: AbortController;
  /** 생성 완료된 임시 파일 artifact. */
  artifact?: MediaDownloadArtifact;
  /** 사용자에게 보여줄 상태 메시지. */
  message?: string;
  /** file endpoint가 artifact를 넘겨받았는지 여부. */
  consumed?: boolean;
};
