import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { type PopupStatusKind } from '../domain/popup-state/popup-state';
import {
  type PopupDownloadModel,
  type PopupDownloadSnapshot,
  createChromePopupDownloadModel,
} from '../features/popup-download/popup-download-model';

/** Popup status visual tone. */
type StatusTone = 'danger' | 'info' | 'success' | 'warning';

/** 형식별 옵션 필드 copy. */
type AdaptiveOptionCopy = {
  /** 옵션 입력 안내 문구. */
  description: string;
  /** 옵션 input mode. */
  inputMode: 'numeric';
  /** 옵션 label. */
  label: string;
  /** 옵션 input name. */
  name: 'bitrate' | 'resolution';
  /** 옵션 input 값. */
  value: string;
};

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
  /** 현재 상태 visual tone. */
  const statusTone = getStatusTone(snapshot.status.kind);
  /** 현재 상태 label. */
  const statusLabel = getStatusLabel(snapshot.status.kind);
  /** 제출 버튼 문구. */
  const submitLabel = getSubmitLabel(snapshot);
  /** 원본 URL 입력 강조 여부. */
  const shouldEmphasizeSourceUrl = isSourceUrlStatusWarning(snapshot.status.kind);
  /** 형식별 옵션 필드 copy. */
  const adaptiveOption = getAdaptiveOptionCopy(snapshot);

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

  function handleTextOptionChange<Key extends 'sourceUrl' | 'filename' | 'bitrate' | 'resolution'>(
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

  function handleImportCurrentTabUrl() {
    void getPopupModel().importCurrentTabUrl();
  }

  return (
    <main className="popup-shell" data-status={snapshot.status.kind}>
      <header className="loot-banner">
        <div className="brand-lockup">
          <p className="brand-kicker">16-bit media extractor</p>
          <h1 className="popup-title">MyTube Extract</h1>
          <p className="hero-copy">이 영상은 이제 제 겁니다</p>
        </div>
        <div className="pixel-extractor" aria-hidden="true">
          <span className="pixel pixel--arm" />
          <span className="pixel pixel--claw" />
          <span className="pixel pixel--capsule" />
        </div>
      </header>

      <p className="policy-strip">저작권 및 플랫폼 정책을 준수해 사용하세요.</p>

      <section className={`status-card status-card--${statusTone}`} aria-labelledby="status-title">
        <p id="status-title" className="status-label">
          {statusLabel}
        </p>
        <p id="tab-status" className="status-text" role="status">
          {snapshot.status.message}
        </p>
      </section>

      <form className="download-form" onSubmit={handleSubmit}>
        <label className={shouldEmphasizeSourceUrl ? 'field source-field has-warning' : 'field source-field'}>
          <span className="field-label">추출 URL</span>
          <span className="field-description">YouTube watch, Shorts, youtu.be URL을 붙여넣으세요.</span>
          <input
            autoComplete="off"
            name="sourceUrl"
            placeholder="https://www.youtube.com/watch?v=..."
            type="url"
            value={snapshot.options.sourceUrl}
            onChange={handleTextOptionChange('sourceUrl')}
          />
          <button
            className="secondary-button"
            disabled={snapshot.downloading}
            type="button"
            onClick={handleImportCurrentTabUrl}
          >
            현재 탭 사용
          </button>
        </label>

        <fieldset className="mode-group">
          <legend>추출 형식</legend>
          <label className={selectedMode === 'audio' ? 'mode-option is-selected' : 'mode-option'}>
            <input
              checked={selectedMode === 'audio'}
              name="mode"
              type="radio"
              value="audio"
              onChange={handleModeChange}
            />
            <span aria-hidden="true">♪</span>
            오디오
          </label>
          <label className={selectedMode === 'video' ? 'mode-option is-selected' : 'mode-option'}>
            <input
              checked={selectedMode === 'video'}
              name="mode"
              type="radio"
              value="video"
              onChange={handleModeChange}
            />
            <span aria-hidden="true">▣</span>
            비디오
          </label>
        </fieldset>

        <label className="field">
          <span className="field-label">파일명</span>
          <span className="field-description">비워두면 서버 기본값을 사용합니다.</span>
          <input
            autoComplete="off"
            name="filename"
            type="text"
            value={snapshot.options.filename}
            onChange={handleTextOptionChange('filename')}
          />
        </label>

        <label className="field">
          <span className="field-label">{adaptiveOption.label}</span>
          <span className="field-description">{adaptiveOption.description}</span>
          <input
            inputMode={adaptiveOption.inputMode}
            min="1"
            name={adaptiveOption.name}
            type="number"
            value={adaptiveOption.value}
            onChange={handleTextOptionChange(adaptiveOption.name)}
          />
        </label>

        <button className="primary-button" disabled={!snapshot.canDownload} type="submit">
          {submitLabel}
        </button>
      </form>
    </main>
  );
}

/** 상태별 visual tone을 반환한다. */
function getStatusTone(statusKind: PopupStatusKind): StatusTone {
  if (statusKind === 'ready' || statusKind === 'download-started') {
    return 'success';
  }

  if (statusKind === 'checking-server') {
    return 'info';
  }

  if (statusKind === 'missing-source-url' || statusKind === 'invalid-source-url') {
    return 'warning';
  }

  return 'danger';
}

/** 상태별 짧은 label을 반환한다. */
function getStatusLabel(statusKind: PopupStatusKind) {
  /** 상태 label map. */
  const labels: Record<PopupStatusKind, string> = {
    'missing-source-url': 'INPUT',
    'invalid-source-url': 'CHECK',
    ready: 'READY',
    'checking-server': 'LINK',
    'download-started': 'LOOT',
    'download-failed': 'ERROR',
  };

  return labels[statusKind];
}

/** 제출 버튼에 표시할 문구를 반환한다. */
function getSubmitLabel(snapshot: PopupDownloadSnapshot) {
  if (snapshot.downloading || snapshot.status.kind === 'checking-server') {
    return '서버 확인 중...';
  }

  if (snapshot.status.kind === 'download-started') {
    return '다시 추출';
  }

  if (snapshot.status.kind === 'download-failed' && snapshot.canDownload) {
    return '다시 시도';
  }

  return '추출 시작';
}

/** 원본 URL을 사용자가 바로 고쳐야 하는 상태인지 확인한다. */
function isSourceUrlStatusWarning(statusKind: PopupStatusKind) {
  return statusKind === 'missing-source-url' || statusKind === 'invalid-source-url';
}

/** 현재 추출 형식에 맞는 단일 옵션 필드 copy를 만든다. */
function getAdaptiveOptionCopy(snapshot: PopupDownloadSnapshot): AdaptiveOptionCopy {
  if (snapshot.options.mode === 'video') {
    return {
      description: '예: 720. 비워두면 서버가 기본 화질을 고릅니다.',
      inputMode: 'numeric',
      label: '최대 해상도',
      name: 'resolution',
      value: snapshot.options.resolution,
    };
  }

  return {
    description: '예: 192. 비워두면 서버가 기본 음질을 고릅니다.',
    inputMode: 'numeric',
    label: '최대 비트레이트',
    name: 'bitrate',
    value: snapshot.options.bitrate,
  };
}
