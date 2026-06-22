/** Chrome tabs adapter. */
export type TabsAdapter = {
  /** 현재 활성 탭 URL을 읽는다. */
  getCurrentTabUrl(): Promise<string>;
};

/** Chrome tabs adapter를 만든다. */
export function createTabsAdapter(chromeApi: typeof chrome = chrome): TabsAdapter {
  return {
    getCurrentTabUrl() {
      return new Promise((resolve, reject) => {
        chromeApi.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
          if (chromeApi.runtime.lastError) {
            reject(new Error('Could not read the current tab URL.'));
            return;
          }

          /** 현재 활성 탭 URL. */
          const currentTabUrl = tabs[0]?.url ?? '';

          if (!currentTabUrl) {
            reject(new Error('Current tab URL is unavailable.'));
            return;
          }

          resolve(currentTabUrl);
        });
      });
    },
  };
}
