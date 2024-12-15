type CommonInput = {
  filename?: string;
  bitrate?: number;
};

export type GetAudioInput = CommonInput & {
  url: string;
};

export type GetAudioByIdInput = CommonInput;
