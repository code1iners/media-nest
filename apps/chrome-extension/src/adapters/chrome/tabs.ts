/** Active tab 조회 adapter. */
export type TabsAdapter = {
  /** 현재 창의 active tab URL을 반환한다. */
  getActiveTabUrl(): Promise<string | null>;
};

/** Chrome tabs adapter를 만든다. */
export function createTabsAdapter(chromeApi: typeof chrome = chrome): TabsAdapter {
  return {
    getActiveTabUrl() {
      return new Promise((resolve, reject) => {
        chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (chromeApi.runtime.lastError) {
            reject(new Error('Could not read the active tab.'));
            return;
          }

          /** 현재 창의 active tab 후보. */
          const [activeTab] = tabs;

          resolve(activeTab?.url ?? null);
        });
      });
    },
  };
}
