type CommonInput = {
  /** 다운로드 파일명. */
  filename?: string;
  /** 최대 오디오 비트레이트. */
  bitrate?: number | string;
};

export type GetAudioInput = CommonInput & {
  /** 오디오를 추출할 원본 URL. */
  url: string;
};

export type GetAudioByIdInput = CommonInput;
