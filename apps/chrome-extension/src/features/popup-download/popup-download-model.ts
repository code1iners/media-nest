import { type DownloadsAdapter, createDownloadsAdapter } from '../../adapters/chrome/downloads';
import { type StorageAdapter, createStorageAdapter } from '../../adapters/chrome/storage';
import { type TabsAdapter, createTabsAdapter } from '../../adapters/chrome/tabs';
import {
  type DownloadOptions,
  DEFAULT_DOWNLOAD_OPTIONS,
  normalizeApiBaseUrl,
} from '../../domain/download-options/download-options';
import {
  CHECKING_SERVER_STATUS,
  CHECKING_TAB_STATUS,
  DOWNLOAD_STARTED_STATUS,
  MISSING_API_URL_STATUS,
  type PopupStatus,
  UNSUPPORTED_PAGE_STATUS,
  createDownloadFailedStatus,
  createReadyStatus,
} from '../../domain/popup-state/popup-state';
import { type YoutubeTabInfo, detectYoutubeVideoId } from '../../domain/youtube/youtube-url';
import { buildDownloadUrl } from '../../services/media-nest/download-url';
import { type MediaNestClient, createMediaNestClient } from '../../services/media-nest/media-nest-client';

/** Popup model dependency. */
export type PopupDownloadModelDependencies = {
  /** Active tab adapter. */
  tabs: TabsAdapter;
  /** Storage adapter. */
  storage: StorageAdapter;
  /** Downloads adapter. */
  downloads: DownloadsAdapter;
  /** Media Nest API client. */
  mediaNestClient: MediaNestClient;
};

/** Popup 화면 snapshot. */
export type PopupDownloadSnapshot = {
  /** 다운로드 가능 여부. */
  canDownload: boolean;
  /** 다운로드 진행 중 여부. */
  downloading: boolean;
  /** 현재 form option. */
  options: DownloadOptions;
  /** 현재 상태. */
  status: PopupStatus;
  /** 감지된 YouTube tab 정보. */
  tabInfo: YoutubeTabInfo | null;
};

/** Popup model. */
export type PopupDownloadModel = {
  /** 현재 snapshot을 반환한다. */
  getSnapshot(): PopupDownloadSnapshot;
  /** Popup 초기화를 수행한다. */
  initialize(): Promise<void>;
  /** Snapshot 변경 구독을 등록한다. */
  subscribe(listener: () => void): () => void;
  /** Download submit을 처리한다. */
  submitDownload(): Promise<void>;
  /** Form option 변경을 처리한다. */
  updateOption<Key extends keyof DownloadOptions>(
    key: Key,
    value: DownloadOptions[Key],
  ): Promise<void>;
};

/** 초기 popup snapshot. */
const INITIAL_SNAPSHOT: PopupDownloadSnapshot = {
  canDownload: false,
  downloading: false,
  options: DEFAULT_DOWNLOAD_OPTIONS,
  status: CHECKING_TAB_STATUS,
  tabInfo: null,
};

/** Chrome runtime용 popup model을 만든다. */
export function createChromePopupDownloadModel(): PopupDownloadModel {
  return createPopupDownloadModel({
    tabs: createTabsAdapter(),
    storage: createStorageAdapter(),
    downloads: createDownloadsAdapter(),
    mediaNestClient: createMediaNestClient(),
  });
}

/** Popup download model을 만든다. */
export function createPopupDownloadModel(
  dependencies: PopupDownloadModelDependencies,
): PopupDownloadModel {
  /** 현재 popup snapshot. */
  let snapshot = INITIAL_SNAPSHOT;
  /** Snapshot 변경 listener 목록. */
  const listeners = new Set<() => void>();

  /** Snapshot을 갱신하고 listener에게 알린다. */
  function setSnapshot(nextSnapshot: PopupDownloadSnapshot) {
    snapshot = nextSnapshot;
    listeners.forEach((listener) => listener());
  }

  /** 현재 옵션과 탭 상태를 기준으로 ready state를 계산한다. */
  function renderReadyState(baseSnapshot: PopupDownloadSnapshot): PopupDownloadSnapshot {
    if (!baseSnapshot.tabInfo) {
      return {
        ...baseSnapshot,
        canDownload: false,
        status: UNSUPPORTED_PAGE_STATUS,
      };
    }

    try {
      normalizeApiBaseUrl(baseSnapshot.options.apiBaseUrl);

      return {
        ...baseSnapshot,
        canDownload: !baseSnapshot.downloading,
        status: createReadyStatus(baseSnapshot.tabInfo.videoId),
      };
    } catch {
      return {
        ...baseSnapshot,
        canDownload: false,
        status: MISSING_API_URL_STATUS,
      };
    }
  }

  return {
    getSnapshot() {
      return snapshot;
    },
    async initialize() {
      /** 저장된 option. */
      let options = DEFAULT_DOWNLOAD_OPTIONS;

      try {
        options = await dependencies.storage.loadOptions();
      } catch {
        options = DEFAULT_DOWNLOAD_OPTIONS;
      }

      /** 현재 active tab URL. */
      let activeTabUrl: string | null;

      try {
        activeTabUrl = await dependencies.tabs.getActiveTabUrl();
      } catch (error) {
        /** 사용자에게 표시할 active tab 조회 실패 메시지. */
        const errorMessage =
          error instanceof Error ? error.message : 'Could not read the active tab.';

        setSnapshot({
          ...snapshot,
          canDownload: false,
          options,
          status: createDownloadFailedStatus(errorMessage),
          tabInfo: null,
        });
        return;
      }

      /** 감지된 YouTube tab 정보. */
      const tabInfo = detectYoutubeVideoId(activeTabUrl);

      setSnapshot(
        renderReadyState({
          ...snapshot,
          options,
          tabInfo,
        }),
      );
    },
    subscribe(listener) {
      listeners.add(listener);

      return function unsubscribePopupDownloadModel() {
        listeners.delete(listener);
      };
    },
    async submitDownload() {
      /** 제출 시점의 popup snapshot. */
      const submittedSnapshot = snapshot;

      if (
        !submittedSnapshot.tabInfo ||
        submittedSnapshot.downloading ||
        !submittedSnapshot.canDownload
      ) {
        return;
      }

      setSnapshot({
        ...submittedSnapshot,
        canDownload: false,
        downloading: true,
        status: CHECKING_SERVER_STATUS,
      });

      try {
        await dependencies.mediaNestClient.assertServerAvailable(
          submittedSnapshot.options.apiBaseUrl,
        );

        /** Chrome downloads API에 전달할 다운로드 URL. */
        const downloadUrl = buildDownloadUrl({
          ...submittedSnapshot.options,
          videoId: submittedSnapshot.tabInfo.videoId,
        });

        await dependencies.downloads.startDownload(downloadUrl);
        /** 다운로드 시작 후 다시 실행 가능한 snapshot. */
        const completedSnapshot = renderReadyState({
          ...snapshot,
          downloading: false,
        });

        setSnapshot({
          ...completedSnapshot,
          status: DOWNLOAD_STARTED_STATUS,
        });
      } catch (error) {
        /** 사용자에게 표시할 실패 메시지. */
        const errorMessage =
          error instanceof Error ? error.message : 'Download failed. Please try again.';
        /** 실패 후 재시도 가능한 snapshot. */
        const failedSnapshot = renderReadyState({
          ...snapshot,
          downloading: false,
        });

        setSnapshot({
          ...failedSnapshot,
          status: createDownloadFailedStatus(errorMessage),
        });
      }
    },
    async updateOption(key, value) {
      /** 변경된 다운로드 옵션. */
      const options = {
        ...snapshot.options,
        [key]: value,
      };

      setSnapshot(
        renderReadyState({
          ...snapshot,
          options,
        }),
      );

      try {
        await dependencies.storage.saveOptions(options);
      } catch {
        setSnapshot({
          ...snapshot,
          status: createDownloadFailedStatus('Could not save extension settings.'),
        });
      }
    },
  };
}
