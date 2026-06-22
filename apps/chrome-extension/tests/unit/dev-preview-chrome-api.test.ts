import { describe, expect, it, vi } from 'vitest';
import {
  hasChromeExtensionRuntime,
  installDevPreviewChromeApi,
} from '../../entrypoints/popup/dev-preview-chrome-api';

/** 테스트용 memory localStorage를 만든다. */
function createMemoryStorage() {
  /** 저장된 key-value map. */
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe('dev preview chrome API', () => {
  it('installs fake Chrome APIs when the popup runs as a localhost preview', async () => {
    /** 테스트용 global target. */
    const target = {
      location: {
        search: '',
      },
      open: vi.fn(),
    } as unknown as typeof globalThis;
    /** 테스트용 localStorage. */
    const storage = createMemoryStorage();
    /** 다운로드 URL opener. */
    const openUrl = vi.fn();

    expect(
      installDevPreviewChromeApi({
        target,
        storage,
        openUrl,
      }),
    ).toBe(true);
    expect(hasChromeExtensionRuntime(target)).toBe(true);

    /** Preview storage option. */
    const options = await new Promise<Record<string, unknown>>((resolve) => {
      (target.chrome.storage.local.get as (keys: string[], callback: typeof resolve) => void)(
        ['filename', 'mode'],
        resolve,
      );
    });
    /** Preview download id. */
    const downloadId = await new Promise<number | undefined>((resolve) => {
      target.chrome.downloads.download(
        { url: 'http://127.0.0.1:3031/audio/abc123_DEF0' },
        resolve,
      );
    });
    /** Preview current tab query result. */
    const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      target.chrome.tabs.query({ active: true, lastFocusedWindow: true }, resolve);
    });

    expect(options).toEqual({});
    expect(downloadId).toBe(1);
    expect(tabs[0]?.url).toBe('https://www.youtube.com/watch?v=abc123_DEF0');
    expect(openUrl).toHaveBeenCalledWith('http://127.0.0.1:3031/audio/abc123_DEF0');
  });

  it('does not replace the real Chrome extension runtime', () => {
    /** 실제 runtime처럼 보이는 Chrome API. */
    const chromeApi = {
      runtime: {},
      storage: {
        local: {},
      },
      downloads: {},
      tabs: {},
    };
    /** 테스트용 global target. */
    const target = {
      chrome: chromeApi,
    } as unknown as typeof globalThis;

    expect(installDevPreviewChromeApi({ target })).toBe(false);
    expect(target.chrome).toBe(chromeApi);
  });
});
