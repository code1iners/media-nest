import { STORAGE_KEYS } from '../../src/shared/constants';

/** Dev preview option storage key. */
const DEV_PREVIEW_STORAGE_KEY = 'media-nest-dev-preview-options';

/** Dev preview chrome API 설치 option. */
type InstallDevPreviewChromeApiOptions = {
  /** Chrome API를 설치할 target object. */
  target?: typeof globalThis;
  /** Preview URL query string. */
  locationSearch?: string;
  /** Preview local storage. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** 다운로드 URL open 함수. */
  openUrl?: (url: string) => void;
};

/** Dev preview에서 저장하는 option map. */
type DevPreviewStoredOptions = Record<string, unknown>;

/** Chrome extension runtime API가 이미 있는지 확인한다. */
export function hasChromeExtensionRuntime(target: typeof globalThis = globalThis): boolean {
  /** Runtime에서 제공되는 Chrome API 후보. */
  const chromeApi = target.chrome;

  return Boolean(
    chromeApi?.runtime &&
      chromeApi.storage?.local &&
      chromeApi.downloads,
  );
}

/** localhost preview에서 popup이 동작하도록 fake Chrome API를 설치한다. */
export function installDevPreviewChromeApi(options: InstallDevPreviewChromeApiOptions = {}): boolean {
  /** Chrome API를 설치할 target object. */
  const target = options.target ?? globalThis;

  if (hasChromeExtensionRuntime(target)) {
    return false;
  }

  /** Preview option storage. */
  const storage = options.storage ?? target.localStorage;
  /** Preview download URL opener. */
  const openUrl =
    options.openUrl ??
    ((url: string) => {
      target.open(url, '_blank');
    });
  /** Preview 저장 option. */
  const storedOptions = readStoredOptions(storage);

  target.chrome = createDevPreviewChromeApi({
    openUrl,
    storage,
    storedOptions,
  });

  return true;
}

/** Dev preview용 fake Chrome API를 만든다. */
function createDevPreviewChromeApi({
  openUrl,
  storage,
  storedOptions,
}: {
  /** 다운로드 URL open 함수. */
  openUrl: (url: string) => void;
  /** Preview option storage. */
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  /** Preview 저장 option. */
  storedOptions: DevPreviewStoredOptions;
}): typeof chrome {
  /** 현재 preview option. */
  let currentOptions: DevPreviewStoredOptions = {
    ...storedOptions,
  };

  /** Popup이 사용하는 Chrome API subset. */
  const chromeApi = {
    runtime: {
      lastError: null,
    },
    storage: {
      local: {
        get(keys: unknown, callback: (items: DevPreviewStoredOptions) => void) {
          /** Chrome storage get 결과. */
          const result: DevPreviewStoredOptions = {};

          if (Array.isArray(keys)) {
            keys.forEach((key) => {
              if (
                typeof key === 'string' &&
                STORAGE_KEYS.includes(key as (typeof STORAGE_KEYS)[number]) &&
                currentOptions[key] !== undefined
              ) {
                result[key] = currentOptions[key];
              }
            });
          } else {
            Object.assign(result, currentOptions);
          }

          callback(result);
        },
        set(items: DevPreviewStoredOptions, callback?: () => void) {
          currentOptions = {
            ...currentOptions,
            ...items,
          };
          storage.setItem(DEV_PREVIEW_STORAGE_KEY, JSON.stringify(currentOptions));
          callback?.();
        },
      },
    },
    downloads: {
      download(downloadOptions: { url: string }, callback?: (downloadId?: number) => void) {
        openUrl(downloadOptions.url);
        callback?.(1);
      },
    },
  };

  return chromeApi as unknown as typeof chrome;
}

/** Dev preview 저장 option을 읽는다. */
function readStoredOptions(storage: Pick<Storage, 'getItem'> | undefined): DevPreviewStoredOptions {
  if (!storage) {
    return {};
  }

  try {
    /** 저장된 preview option JSON. */
    const storedValue = storage.getItem(DEV_PREVIEW_STORAGE_KEY);

    if (!storedValue) {
      return {};
    }

    /** 파싱한 preview option. */
    const parsedValue = JSON.parse(storedValue);

    return typeof parsedValue === 'object' && parsedValue !== null ? parsedValue : {};
  } catch {
    return {};
  }
}
