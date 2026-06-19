import {
  type DownloadOptions,
  type StoredDownloadOptions,
  mergeStoredDownloadOptions,
} from '../../domain/download-options/download-options';
import { STORAGE_KEYS } from '../../shared/constants';

/** Download option 저장소 adapter. */
export type StorageAdapter = {
  /** 저장된 다운로드 옵션을 기본값과 병합해 읽는다. */
  loadOptions(): Promise<DownloadOptions>;
  /** 다운로드 옵션을 저장한다. */
  saveOptions(options: DownloadOptions): Promise<void>;
};

/** Chrome storage adapter를 만든다. */
export function createStorageAdapter(chromeApi: typeof chrome = chrome): StorageAdapter {
  return {
    loadOptions() {
      return new Promise((resolve, reject) => {
        chromeApi.storage.local.get([...STORAGE_KEYS], (items) => {
          if (chromeApi.runtime.lastError) {
            reject(new Error('Could not load extension settings.'));
            return;
          }

          resolve(mergeStoredDownloadOptions(items as StoredDownloadOptions));
        });
      });
    },
    saveOptions(options) {
      return new Promise((resolve, reject) => {
        chromeApi.storage.local.set(options, () => {
          if (chromeApi.runtime.lastError) {
            reject(new Error('Could not save extension settings.'));
            return;
          }

          resolve();
        });
      });
    },
  };
}
