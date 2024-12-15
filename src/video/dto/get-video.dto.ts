export type GetVideoByIdInput = {
  filename?: string;
  resolution?: number;
};

export type GetVideoInput = GetVideoByIdInput & {
  url: string;
};
