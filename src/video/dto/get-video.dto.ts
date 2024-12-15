export type CommonInput = {
  filename?: string;
  resolution?: number;
};

export type GetVideoByIdInput = CommonInput;

export type GetVideoInput = GetVideoByIdInput & {
  url: string;
};
