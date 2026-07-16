import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { type PopupStatusKind } from '../domain/popup-state/popup-state';
import { type PopupDownloadModel, type PopupDownloadSnapshot, createChromePopupDownloadModel } from '../features/popup-download/popup-download-model';
import { type ThemePreference, getThemePreference, setThemePreference } from '../shared/theme-preference';

/** Popup에서 단독으로 보여 줄 화면 단계. */
type PopupViewPhase = 'request' | 'processing' | 'result' | 'error';

/** Popup status의 시각적 강조 색상. */
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

/** URL 입력 아래에 표시할 피드백. */
type SourceUrlFeedback = {
  /** URL 입력 오류 여부. */
  hasInputError: boolean;
  /** 사용자에게 표시할 피드백 문구. */
  message: string;
};

/** Popup download app component. */
export function PopupApp() {
  // Refs.

  /** Popup application model instance. */
  const modelRef = useRef<PopupDownloadModel | null>(null);

  // States.

  /** Popup 화면 snapshot. */
  const [snapshot, setSnapshot] = useState<PopupDownloadSnapshot>(() => getPopupModel().getSnapshot());
  /** 사용자가 선택한 popup theme 방식. */
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(getThemePreference);

  // Computed.

  /** 현재 다운로드 모드. */
  const selectedMode = snapshot.options.mode;
  /** 현재 status에 맞는 단일 popup 화면. */
  const viewPhase = getPopupViewPhase(snapshot.status.kind);
  /** 현재 상태 visual tone. */
  const statusTone = getStatusTone(snapshot.status.kind);
  /** 현재 상태 label. */
  const statusLabel = getStatusLabel(snapshot.status.kind);
  /** 제출 버튼 문구. */
  const submitLabel = getSubmitLabel(snapshot);
  /** 원본 URL 입력 피드백. */
  const sourceUrlFeedback = getSourceUrlFeedback(snapshot);
  /** 형식별 옵션 필드 copy. */
  const adaptiveOption = getAdaptiveOptionCopy(snapshot);

  // Functions.

  /** popup model을 지연 생성한다. */
  function getPopupModel() {
    if (!modelRef.current) {
      modelRef.current = createChromePopupDownloadModel();
    }

    return modelRef.current;
  }

  /** model 변경을 React snapshot에 반영한다. */
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

  /** 다운로드 형식 변경을 모델에 반영한다. */
  function handleModeChange(event: ChangeEvent<HTMLInputElement>) {
    /** 선택된 다운로드 모드. */
    const mode = event.currentTarget.value === 'video' ? 'video' : 'audio';
    void getPopupModel().updateOption('mode', mode);
  }

  /** 텍스트 기반 다운로드 옵션을 모델에 반영한다. */
  function handleTextOptionChange<Key extends 'sourceUrl' | 'filename' | 'bitrate' | 'resolution'>(key: Key) {
    return function updateTextOption(event: ChangeEvent<HTMLInputElement>) {
      void getPopupModel().updateOption(key, event.currentTarget.value);
    };
  }

  /** form submit으로 서버 확인과 다운로드 요청을 시작한다. */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void getPopupModel().submitDownload();
  }

  /** 현재 탭의 YouTube URL을 form에 가져온다. */
  function handleImportCurrentTabUrl() {
    void getPopupModel().importCurrentTabUrl();
  }

  /** 완료 또는 오류 화면에서 설정 form으로 돌아간다. */
  function handleReturnToForm() {
    void getPopupModel().returnToForm();
  }

  /** native select theme 선택을 localStorage와 화면에 반영한다. */
  function handleThemeChange(event: ChangeEvent<HTMLSelectElement>) {
    /** 선택한 theme 방식. */
    const preference = event.currentTarget.value as ThemePreference;
    setThemePreferenceState(preference);
    setThemePreference(preference);
  }

  return <main className="popup-shell" data-phase={viewPhase} data-status={snapshot.status.kind}>
    <header className="popup-header">
      <div><h1 className="popup-title">MyTube <span>Extract</span></h1><p>영상 추출 도구</p></div>
      <label className="popup-theme-control"><span>테마</span><select value={themePreference} onChange={handleThemeChange}><option value="system">시스템</option><option value="light">라이트</option><option value="dark">다크</option></select></label>
    </header>
    <p className="policy-strip">저작권 및 플랫폼 정책을 준수해 사용하세요.</p>
    {viewPhase === 'request' ? <RequestForm snapshot={snapshot} selectedMode={selectedMode} adaptiveOption={adaptiveOption} sourceUrlFeedback={sourceUrlFeedback} submitLabel={submitLabel} onImportCurrentTabUrl={handleImportCurrentTabUrl} onModeChange={handleModeChange} onSubmit={handleSubmit} onTextOptionChange={handleTextOptionChange} /> : null}
    {viewPhase === 'processing' ? <StatusScreen label={statusLabel} message={snapshot.status.message} tone={statusTone} /> : null}
    {viewPhase === 'result' ? <StatusScreen label={statusLabel} message={snapshot.status.message} tone={statusTone} actionLabel="새 요청" onAction={handleReturnToForm} /> : null}
    {viewPhase === 'error' ? <StatusScreen label={statusLabel} message={snapshot.status.message} tone={statusTone} actionLabel="요청 설정으로 돌아가기" isAlert onAction={handleReturnToForm} /> : null}
  </main>;
}

/** popup의 요청 설정 form을 렌더링한다. */
function RequestForm(props: { /** 현재 popup snapshot. */ snapshot: PopupDownloadSnapshot; /** 선택 mode. */ selectedMode: 'audio' | 'video'; /** mode별 옵션. */ adaptiveOption: AdaptiveOptionCopy; /** URL 입력 피드백. */ sourceUrlFeedback: SourceUrlFeedback | null; /** CTA 문구. */ submitLabel: string; /** 현재 탭 URL 가져오기. */ onImportCurrentTabUrl: () => void; /** mode 변경. */ onModeChange: (event: ChangeEvent<HTMLInputElement>) => void; /** form 제출. */ onSubmit: (event: FormEvent<HTMLFormElement>) => void; /** 텍스트 option 변경 handler 생성기. */ onTextOptionChange: <Key extends 'sourceUrl' | 'filename' | 'bitrate' | 'resolution'>(key: Key) => (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <form className="download-form" onSubmit={props.onSubmit}>
    <label className={props.sourceUrlFeedback?.hasInputError ? 'field source-field has-warning' : 'field source-field'}><span className="field-label">추출 URL</span><span className="field-description">YouTube watch, Shorts, youtu.be URL을 붙여넣으세요.</span><input aria-describedby={props.sourceUrlFeedback ? 'source-url-feedback' : undefined} aria-invalid={props.sourceUrlFeedback?.hasInputError || undefined} autoComplete="off" name="sourceUrl" placeholder="https://www.youtube.com/watch?v=..." type="url" value={props.snapshot.options.sourceUrl} onChange={props.onTextOptionChange('sourceUrl')} /><button className="secondary-button" disabled={props.snapshot.downloading} type="button" onClick={props.onImportCurrentTabUrl}>현재 탭 사용</button>{props.sourceUrlFeedback ? <p className={props.sourceUrlFeedback.hasInputError ? 'field-feedback field-feedback--error' : 'field-feedback'} id="source-url-feedback" role={props.sourceUrlFeedback.hasInputError ? 'alert' : undefined}>{props.sourceUrlFeedback.message}</p> : null}</label>
    <fieldset className="mode-group"><legend>추출 형식</legend><label className={props.selectedMode === 'audio' ? 'mode-option is-selected' : 'mode-option'}><input checked={props.selectedMode === 'audio'} name="mode" type="radio" value="audio" onChange={props.onModeChange} />오디오</label><label className={props.selectedMode === 'video' ? 'mode-option is-selected' : 'mode-option'}><input checked={props.selectedMode === 'video'} name="mode" type="radio" value="video" onChange={props.onModeChange} />비디오</label></fieldset>
    <label className="field"><span className="field-label">파일명</span><span className="field-description">비워두면 서버 기본값을 사용합니다.</span><input autoComplete="off" name="filename" type="text" value={props.snapshot.options.filename} onChange={props.onTextOptionChange('filename')} /></label>
    <label className="field"><span className="field-label">{props.adaptiveOption.label}</span><span className="field-description">{props.adaptiveOption.description}</span><input inputMode={props.adaptiveOption.inputMode} min="1" name={props.adaptiveOption.name} type="number" value={props.adaptiveOption.value} onChange={props.onTextOptionChange(props.adaptiveOption.name)} /></label>
    <button className="primary-button" disabled={!props.snapshot.canDownload} type="submit">{props.submitLabel}</button>
  </form>;
}

/** 처리, 결과, 오류 단계의 단일 status screen을 렌더링한다. */
function StatusScreen(props: { /** 상태 라벨. */ label: string; /** 상태 설명. */ message: string; /** 상태 색상. */ tone: StatusTone; /** form 복귀 행동. */ onAction?: () => void; /** 행동 버튼 문구. */ actionLabel?: string; /** 오류 alert 여부. */ isAlert?: boolean }) {
  return <section className={`status-card status-card--${props.tone}`} aria-labelledby="status-title"><p id="status-title" className="status-label">{props.label}</p><p className="status-text" role={props.isAlert ? 'alert' : 'status'} aria-live="polite">{props.message}</p>{props.onAction ? <button className="primary-button" type="button" onClick={props.onAction}>{props.actionLabel}</button> : null}</section>;
}

/** status kind를 요청·처리·결과·오류 단일 화면으로 바꾼다. */
function getPopupViewPhase(statusKind: PopupStatusKind): PopupViewPhase {
  if (statusKind === 'checking-server') return 'processing';
  if (statusKind === 'download-started') return 'result';
  if (statusKind === 'download-failed') return 'error';
  return 'request';
}

/** 상태별 visual tone을 반환한다. */
function getStatusTone(statusKind: PopupStatusKind): StatusTone {
  if (statusKind === 'ready' || statusKind === 'download-started') return 'success';
  if (statusKind === 'checking-server') return 'info';
  if (statusKind === 'missing-source-url' || statusKind === 'invalid-source-url') return 'warning';
  return 'danger';
}

/** 상태별 짧은 label을 반환한다. */
function getStatusLabel(statusKind: PopupStatusKind) {
  /** 상태 label map. */
  const labels: Record<PopupStatusKind, string> = { 'missing-source-url': '입력 필요', 'invalid-source-url': 'URL 확인', ready: '준비 완료', 'checking-server': '서버 확인 중', 'download-started': '요청 완료', 'download-failed': '오류' };
  return labels[statusKind];
}

/** 제출 버튼에 표시할 문구를 반환한다. */
function getSubmitLabel(snapshot: PopupDownloadSnapshot) {
  if (snapshot.downloading || snapshot.status.kind === 'checking-server') return '서버 확인 중';
  if (snapshot.status.kind === 'download-failed' && snapshot.canDownload) return '다시 시도';
  return '추출 시작';
}

/** Popup status를 URL 입력 피드백으로 바꾼다. */
function getSourceUrlFeedback(snapshot: PopupDownloadSnapshot): SourceUrlFeedback | null {
  if (snapshot.status.kind !== 'missing-source-url' && snapshot.status.kind !== 'invalid-source-url') {
    return null;
  }

  return {
    hasInputError:
      snapshot.status.kind === 'invalid-source-url' && !snapshot.canDownload,
    message: snapshot.status.message,
  };
}

/** 현재 추출 형식에 맞는 단일 옵션 필드 copy를 만든다. */
function getAdaptiveOptionCopy(snapshot: PopupDownloadSnapshot): AdaptiveOptionCopy {
  if (snapshot.options.mode === 'video') return { description: '예: 720. 비워두면 서버가 기본 화질을 고릅니다.', inputMode: 'numeric', label: '최대 해상도', name: 'resolution', value: snapshot.options.resolution };
  return { description: '예: 192. 비워두면 서버가 기본 음질을 고릅니다.', inputMode: 'numeric', label: '최대 비트레이트', name: 'bitrate', value: snapshot.options.bitrate };
}
