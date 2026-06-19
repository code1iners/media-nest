import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_DOWNLOAD_OPTIONS } from '../../src/domain/download-options/download-options';
import {
  type PopupDownloadModelDependencies,
  createPopupDownloadModel,
} from '../../src/features/popup-download/popup-download-model';

/** 테스트용 model dependency를 만든다. */
function createDependencies(
  overrides: Partial<PopupDownloadModelDependencies> = {},
): PopupDownloadModelDependencies {
  /** 저장된 다운로드 옵션. */
  const savedOptions = {
    ...DEFAULT_DOWNLOAD_OPTIONS,
    apiBaseUrl: 'http://127.0.0.1:3030',
  };

  return {
    tabs: {
      getActiveTabUrl: vi
        .fn()
        .mockResolvedValue('https://www.youtube.com/watch?v=abc123_DEF0'),
    },
    storage: {
      loadOptions: vi.fn().mockResolvedValue(savedOptions),
      saveOptions: vi.fn().mockResolvedValue(undefined),
    },
    downloads: {
      startDownload: vi.fn().mockResolvedValue(1),
    },
    mediaNestClient: {
      assertServerAvailable: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

describe('popup download model', () => {
  it('enters ready state for supported YouTube tabs and valid API URL', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies();
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();

    expect(model.getSnapshot()).toMatchObject({
      canDownload: true,
      status: {
        kind: 'ready',
        message: '현재 영상 감지 완료: abc123_DEF0',
      },
    });
  });

  it('disables download on unsupported tabs', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies({
      tabs: {
        getActiveTabUrl: vi.fn().mockResolvedValue('https://example.com'),
      },
    });
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();

    expect(model.getSnapshot()).toMatchObject({
      canDownload: false,
      status: {
        kind: 'unsupported-page',
        message: 'YouTube watch 페이지에서 다시 열어주세요.',
      },
    });
  });

  it('disables download when API base URL is invalid', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies({
      storage: {
        loadOptions: vi.fn().mockResolvedValue({
          ...DEFAULT_DOWNLOAD_OPTIONS,
          apiBaseUrl: 'ftp://127.0.0.1',
        }),
        saveOptions: vi.fn().mockResolvedValue(undefined),
      },
    });
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();

    expect(model.getSnapshot()).toMatchObject({
      canDownload: false,
      status: {
        kind: 'missing-api-url',
        message: '올바른 API 서버 주소를 입력하세요.',
      },
    });
  });

  it('shows active tab read failure instead of staying in checking state', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies({
      tabs: {
        getActiveTabUrl: vi.fn().mockRejectedValue(new Error('Could not read the active tab.')),
      },
    });
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();

    expect(model.getSnapshot()).toMatchObject({
      canDownload: false,
      status: {
        kind: 'download-failed',
        message: 'Could not read the active tab.',
      },
    });
  });

  it('checks server and starts a download once for duplicate submits', async () => {
    /** 서버 확인 해제 함수. */
    let releaseServerCheck: () => void = () => {};
    /** Popup model dependency. */
    const dependencies = createDependencies({
      mediaNestClient: {
        assertServerAvailable: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              releaseServerCheck = resolve;
            }),
        ),
      },
    });
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();

    /** 첫 번째 다운로드 submit. */
    const firstSubmit = model.submitDownload();
    /** 중복 다운로드 submit. */
    const secondSubmit = model.submitDownload();

    releaseServerCheck();
    await Promise.all([firstSubmit, secondSubmit]);

    expect(dependencies.mediaNestClient.assertServerAvailable).toHaveBeenCalledTimes(1);
    expect(dependencies.downloads.startDownload).toHaveBeenCalledTimes(1);
    expect(dependencies.downloads.startDownload).toHaveBeenCalledWith(
      'http://127.0.0.1:3030/audio/abc123_DEF0',
    );
    expect(model.getSnapshot().status).toMatchObject({
      kind: 'download-started',
      message: '추출 요청을 시작했습니다.',
    });
  });

  it('uses the submitted options while the server check is pending', async () => {
    /** 서버 확인 해제 함수. */
    let releaseServerCheck: () => void = () => {};
    /** Popup model dependency. */
    const dependencies = createDependencies({
      mediaNestClient: {
        assertServerAvailable: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              releaseServerCheck = resolve;
            }),
        ),
      },
    });
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();

    /** 제출 시점의 다운로드 요청. */
    const submit = model.submitDownload();

    await model.updateOption('mode', 'video');
    await model.updateOption('resolution', '720');
    releaseServerCheck();
    await submit;

    expect(dependencies.downloads.startDownload).toHaveBeenCalledWith(
      'http://127.0.0.1:3030/audio/abc123_DEF0',
    );
  });

  it('shows server unavailable state when health check fails', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies({
      mediaNestClient: {
        assertServerAvailable: vi.fn().mockRejectedValue(new Error('Server is unavailable.')),
      },
    });
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();
    await model.submitDownload();

    expect(model.getSnapshot()).toMatchObject({
      canDownload: true,
      status: {
        kind: 'download-failed',
        message: 'Server is unavailable.',
      },
    });
  });

  it('updates options and preserves video mode specific URL building', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies();
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();
    await model.updateOption('mode', 'video');
    await model.updateOption('resolution', '720');
    await model.submitDownload();

    expect(dependencies.storage.saveOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'video',
        resolution: '720',
      }),
    );
    expect(dependencies.downloads.startDownload).toHaveBeenCalledWith(
      'http://127.0.0.1:3030/video/abc123_DEF0?resolution=720',
    );
  });
});
