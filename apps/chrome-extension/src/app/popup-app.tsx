import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import {
  type PopupDownloadModel,
  type PopupDownloadSnapshot,
  createChromePopupDownloadModel,
} from '../features/popup-download/popup-download-model';

/** Popup download app component. */
export function PopupApp() {
  // Refs.

  /** Popup application model instance. */
  const modelRef = useRef<PopupDownloadModel | null>(null);

  // States.

  /** Popup 화면 snapshot. */
  const [snapshot, setSnapshot] = useState<PopupDownloadSnapshot>(() =>
    getPopupModel().getSnapshot(),
  );

  // Computed.

  /** 현재 다운로드 모드. */
  const selectedMode = snapshot.options.mode;

  // Functions.

  function getPopupModel() {
    if (!modelRef.current) {
      modelRef.current = createChromePopupDownloadModel();
    }

    return modelRef.current;
  }

  function syncSnapshot() {
    setSnapshot(getPopupModel().getSnapshot());
  }

  // Effects.

  useEffect(function initializePopupModel() {
    /** Popup application model. */
    const popupModel = getPopupModel();
    /** Snapshot 구독 해제 함수. */
    const unsubscribe = popupModel.subscribe(syncSnapshot);

    void popupModel.initialize();

    return unsubscribe;
  }, []);

  // Handlers.

  function handleModeChange(event: ChangeEvent<HTMLInputElement>) {
    /** 선택된 다운로드 모드. */
    const mode = event.currentTarget.value === 'video' ? 'video' : 'audio';

    void getPopupModel().updateOption('mode', mode);
  }

  function handleTextOptionChange<Key extends 'apiBaseUrl' | 'filename' | 'bitrate' | 'resolution'>(
    key: Key,
  ) {
    return function updateTextOption(event: ChangeEvent<HTMLInputElement>) {
      void getPopupModel().updateOption(key, event.currentTarget.value);
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void getPopupModel().submitDownload();
  }

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <h1 className="popup-title">Media Nest</h1>
        <p id="tab-status" className="status-text" role="status">
          {snapshot.status.message}
        </p>
      </header>

      <form className="download-form" onSubmit={handleSubmit}>
        <fieldset className="mode-group">
          <legend>Download type</legend>
          <label className="mode-option">
            <input
              checked={selectedMode === 'audio'}
              name="mode"
              type="radio"
              value="audio"
              onChange={handleModeChange}
            />
            Audio
          </label>
          <label className="mode-option">
            <input
              checked={selectedMode === 'video'}
              name="mode"
              type="radio"
              value="video"
              onChange={handleModeChange}
            />
            Video
          </label>
        </fieldset>

        <label className="field">
          API base URL
          <input
            autoComplete="off"
            name="apiBaseUrl"
            type="url"
            value={snapshot.options.apiBaseUrl}
            onChange={handleTextOptionChange('apiBaseUrl')}
          />
        </label>

        <label className="field">
          Filename
          <input
            autoComplete="off"
            name="filename"
            type="text"
            value={snapshot.options.filename}
            onChange={handleTextOptionChange('filename')}
          />
        </label>

        <label className={selectedMode === 'audio' ? 'field' : 'field is-hidden'}>
          Max audio bitrate
          <input
            disabled={selectedMode !== 'audio'}
            inputMode="numeric"
            min="1"
            name="bitrate"
            type="number"
            value={snapshot.options.bitrate}
            onChange={handleTextOptionChange('bitrate')}
          />
        </label>

        <label className={selectedMode === 'video' ? 'field' : 'field is-hidden'}>
          Max video height
          <input
            disabled={selectedMode !== 'video'}
            inputMode="numeric"
            min="1"
            name="resolution"
            type="number"
            value={snapshot.options.resolution}
            onChange={handleTextOptionChange('resolution')}
          />
        </label>

        <button className="primary-button" disabled={!snapshot.canDownload} type="submit">
          Start download
        </button>
      </form>
    </main>
  );
}
