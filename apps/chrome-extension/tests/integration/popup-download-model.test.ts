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
  };

  return {
    storage: {
      loadOptions: vi.fn().mockResolvedValue(savedOptions),
      saveOptions: vi.fn().mockResolvedValue(undefined),
    },
    downloads: {
      startDownload: vi.fn().mockResolvedValue(1),
    },
    tabs: {
      getCurrentTabUrl: vi.fn().mockResolvedValue('https://youtu.be/abc123_DEF0'),
    },
    myTubeExtractClient: {
      assertServerAvailable: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

describe('popup download model', () => {
  it('starts with source URL input required instead of active tab detection', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies();
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();

    expect(model.getSnapshot()).toMatchObject({
      canDownload: false,
      status: {
        kind: 'missing-source-url',
        message: '추출할 URL을 입력하세요.',
      },
    });
  });

  it('enables download when a valid source URL is entered on any page', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies();
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();
    await model.updateOption('sourceUrl', 'https://www.youtube.com/watch?v=abc123_DEF0');

    expect(model.getSnapshot()).toMatchObject({
      canDownload: true,
      status: {
        kind: 'ready',
        message: '추출할 URL이 준비되었습니다.',
      },
    });
  });

  it('does not persist source URLs while keeping the entered URL ready', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies({
      storage: {
        loadOptions: vi.fn().mockResolvedValue(DEFAULT_DOWNLOAD_OPTIONS),
        saveOptions: vi.fn().mockRejectedValue(new Error('storage unavailable')),
      },
    });
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();
    await model.updateOption('sourceUrl', 'https://www.youtube.com/watch?v=abc123_DEF0');

    expect(dependencies.storage.saveOptions).not.toHaveBeenCalled();
    expect(model.getSnapshot()).toMatchObject({
      canDownload: true,
      status: {
        kind: 'ready',
        message: '추출할 URL이 준비되었습니다.',
      },
    });
  });

  it('disables download when source URL is invalid', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies();
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();
    await model.updateOption('sourceUrl', 'not-a-url');

    expect(model.getSnapshot()).toMatchObject({
      canDownload: false,
      status: {
        kind: 'invalid-source-url',
        message: '지원하는 YouTube URL을 입력하세요.',
      },
    });
  });

  it('imports a supported current tab URL without persisting it', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies({
      tabs: {
        getCurrentTabUrl: vi.fn().mockResolvedValue('https://www.youtube.com/shorts/abc123_DEF0'),
      },
    });
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();
    await model.importCurrentTabUrl();

    expect(dependencies.storage.saveOptions).not.toHaveBeenCalled();
    expect(model.getSnapshot()).toMatchObject({
      canDownload: true,
      options: {
        sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
      },
      status: {
        kind: 'ready',
        message: '추출할 URL이 준비되었습니다.',
      },
    });
  });

  it('keeps the entered URL when the current tab URL is unsupported', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies({
      tabs: {
        getCurrentTabUrl: vi.fn().mockResolvedValue('https://example.com/watch?v=abc123_DEF0'),
      },
    });
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();
    await model.updateOption('sourceUrl', 'https://www.youtube.com/watch?v=abc123_DEF0');
    await model.importCurrentTabUrl();

    expect(model.getSnapshot()).toMatchObject({
      canDownload: true,
      options: {
        sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
      },
      status: {
        kind: 'invalid-source-url',
        message: '현재 탭에서 지원하는 YouTube URL을 찾을 수 없습니다.',
      },
    });
  });

  it('uses the production API base URL when no WXT environment override exists', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies();
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();
    await model.updateOption('sourceUrl', 'https://www.youtube.com/watch?v=abc123_DEF0');
    await model.submitDownload();

    expect(dependencies.myTubeExtractClient.assertServerAvailable).toHaveBeenCalledWith(
      'https://media-nest.codeliners.cc',
    );
    expect(dependencies.downloads.startDownload).toHaveBeenCalledWith(
      'https://media-nest.codeliners.cc/audio?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123_DEF0',
    );
  });

  it('checks server and starts a download once for duplicate submits', async () => {
    /** 서버 확인 해제 함수. */
    let releaseServerCheck: () => void = () => {};
    /** Popup model dependency. */
    const dependencies = createDependencies({
      myTubeExtractClient: {
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
    await model.updateOption('sourceUrl', 'https://www.youtube.com/watch?v=abc123_DEF0');

    /** 첫 번째 다운로드 submit. */
    const firstSubmit = model.submitDownload();
    /** 중복 다운로드 submit. */
    const secondSubmit = model.submitDownload();

    releaseServerCheck();
    await Promise.all([firstSubmit, secondSubmit]);

    expect(dependencies.myTubeExtractClient.assertServerAvailable).toHaveBeenCalledTimes(1);
    expect(dependencies.downloads.startDownload).toHaveBeenCalledTimes(1);
    expect(dependencies.downloads.startDownload).toHaveBeenCalledWith(
      'https://media-nest.codeliners.cc/audio?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123_DEF0',
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
      myTubeExtractClient: {
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
    await model.updateOption('sourceUrl', 'https://www.youtube.com/watch?v=abc123_DEF0');

    /** 제출 시점의 다운로드 요청. */
    const submit = model.submitDownload();

    await model.updateOption('sourceUrl', 'https://www.youtube.com/watch?v=changed_ID1');
    await model.updateOption('mode', 'video');
    await model.updateOption('resolution', '720');
    releaseServerCheck();
    await submit;

    expect(dependencies.downloads.startDownload).toHaveBeenCalledWith(
      'https://media-nest.codeliners.cc/audio?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123_DEF0',
    );
  });

  it('shows server unavailable state when health check fails', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies({
      myTubeExtractClient: {
        assertServerAvailable: vi.fn().mockRejectedValue(new Error('Server is unavailable.')),
      },
    });
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();
    await model.updateOption('sourceUrl', 'https://www.youtube.com/watch?v=abc123_DEF0');
    await model.submitDownload();

    expect(model.getSnapshot()).toMatchObject({
      canDownload: true,
      status: {
        kind: 'download-failed',
        message: 'Server is unavailable.',
      },
    });
  });

  it('returns a completed popup to its request settings without clearing the URL', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies();
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();
    await model.updateOption('sourceUrl', 'https://www.youtube.com/watch?v=abc123_DEF0');
    await model.submitDownload();
    await model.returnToForm();

    expect(model.getSnapshot()).toMatchObject({
      canDownload: true,
      downloading: false,
      options: {
        sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
      },
      status: {
        kind: 'ready',
      },
    });
  });

  it('updates options and preserves video mode specific URL building', async () => {
    /** Popup model dependency. */
    const dependencies = createDependencies();
    /** Popup download model. */
    const model = createPopupDownloadModel(dependencies);

    await model.initialize();
    await model.updateOption('sourceUrl', 'https://www.youtube.com/watch?v=abc123_DEF0');
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
      'https://media-nest.codeliners.cc/video?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123_DEF0&resolution=720',
    );
  });
});
