export type CommonInput = {
  /** 다운로드 파일명. */
  filename?: string;
  /** 최대 영상 높이. */
  resolution?: number | string;
};

export type GetVideoByIdInput = CommonInput;

export type GetVideoInput = GetVideoByIdInput & {
  /** 다운로드할 원본 URL. */
  url: string;
};
