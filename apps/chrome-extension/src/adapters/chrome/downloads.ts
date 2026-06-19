/** Chrome downloads adapter. */
export type DownloadsAdapter = {
  /** Chrome downloads API로 다운로드를 시작한다. */
  startDownload(downloadUrl: string): Promise<number>;
};

/** Chrome downloads adapter를 만든다. */
export function createDownloadsAdapter(chromeApi: typeof chrome = chrome): DownloadsAdapter {
  return {
    startDownload(downloadUrl) {
      return new Promise((resolve, reject) => {
        chromeApi.downloads.download({ url: downloadUrl }, (downloadId) => {
          if (chromeApi.runtime.lastError || !downloadId) {
            reject(new Error('Could not start the download.'));
            return;
          }

          resolve(downloadId);
        });
      });
    },
  };
}
