import { ErrorDetailsDisclosure } from '../../components/error-details-disclosure';
import { PixelIcon, type PixelIconName } from '../../components/pixel-art';
import { type SubtitleStepKey, useSubtitlesExtractLogic } from './_hooks/use-subtitles-extract-logic';

/** 처리 화면에서 표시할 자막 단계. */
const SUBTITLE_STEPS: Array<{ /** 단계 key. */ key: SubtitleStepKey; /** 화면 라벨. */ label: string }> = [
  { key: 'queued', label: '대기' },
  { key: 'extracting_audio', label: '음성 추출' },
  { key: 'transcribing', label: 'SRT 생성' },
  { key: 'completed', label: '완료' },
];

/** 자막 추출 route page. */
export function SubtitlesExtractPage() {
  // Hooks.

  /** 자막 업로드 form, job 상태, 사용자 동작. */
  const {
    canSubmit, canChangeWhisperModel, clearSelectedFile, currentStepKey, downloadHref, fileInputRef,
    filledProgressCells, handleDropzoneDragOver, handleDropzoneDrop, handleFileInputChange,
    handleFilePickerOpen, handleSubtitleSubmit, handleWhisperModelChange, isSubtitlePending,
    processingEstimateMessage, retryWorkerHealth, requestAvailabilityNotice, returnToRequest, selectedFile, selectedFileMeta,
    selectedWhisperModel, statusErrorDetail, statusIconName, statusJob, statusMessage, statusTitle,
    statusTone, validation, viewPhase, workerHealthFailed, workerHealthIsFetching,
  } = useSubtitlesExtractLogic();

  if (viewPhase === 'request') {
    return <section className="console-panel phase-panel" aria-labelledby="subtitles-title">
      <PanelTitle icon="subtitle" id="subtitles-title">영어 SRT 생성</PanelTitle>
      <div className="subtitle-form">
        <div className="field"><span className="field-label">로컬 영상 파일</span>
          <input accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" className="subtitle-file-input" ref={fileInputRef} type="file" onChange={handleFileInputChange} />
          <button className="subtitle-dropzone" type="button" onClick={handleFilePickerOpen} onDragOver={handleDropzoneDragOver} onDrop={handleDropzoneDrop}><PixelIcon name="subtitle" /><strong>영상 선택 또는 드래그</strong><span>mp4, mov, webm</span></button>
        </div>
        {selectedFile ? <div className="selected-file-row"><PixelIcon name="video" /><div><strong>{selectedFile.name}</strong><span>{selectedFileMeta}</span></div><button type="button" onClick={clearSelectedFile}>지우기</button></div> : null}
        <fieldset className="segmented-control"><legend>Whisper 모델</legend>
          <label className={selectedWhisperModel === 'base_en' ? 'segment is-selected' : 'segment'}><input checked={selectedWhisperModel === 'base_en'} disabled={!canChangeWhisperModel} name="subtitle-whisper-model" type="radio" value="base_en" onChange={handleWhisperModelChange} /><PixelIcon name="processing" />빠름 · base.en</label>
          <label className={selectedWhisperModel === 'small_en' ? 'segment is-selected' : 'segment'}><input checked={selectedWhisperModel === 'small_en'} disabled={!canChangeWhisperModel} name="subtitle-whisper-model" type="radio" value="small_en" onChange={handleWhisperModelChange} /><PixelIcon name="subtitle" />정확도 · small.en</label>
        </fieldset>
        <p className="subtitle-estimate">{processingEstimateMessage}</p>
        <button className="primary-button" disabled={!canSubmit} type="button" onClick={handleSubtitleSubmit}><PixelIcon name="subtitle" />{isSubtitlePending ? '요청 중' : '영어 SRT 생성'}</button>
        {requestAvailabilityNotice ? <div className="notice-box" role={requestAvailabilityNotice.role}><span aria-hidden="true"><PixelIcon name={requestAvailabilityNotice.role === 'status' ? 'processing' : 'failed'} /></span><p>{requestAvailabilityNotice.message}</p>{requestAvailabilityNotice.showRetry ? <button className="secondary-button secondary-button--compact" disabled={workerHealthIsFetching} type="button" onClick={retryWorkerHealth}>다시 확인</button> : null}</div> : null}
        <div className="notice-box" role="note"><span aria-hidden="true"><PixelIcon name="info" /></span><p>{validation.message}</p><p>영어 SRT 파일만 생성합니다.</p></div>
      </div>
    </section>;
  }

  if (viewPhase === 'processing') {
    return <section className="console-panel phase-panel status-panel" aria-labelledby="subtitle-status-title">
      <PanelTitle icon="processing" id="subtitle-status-title">처리 상태</PanelTitle>
      <StatusHead icon={statusIconName} tone={statusTone} title={statusTitle} message={statusMessage} />
      <div className="subtitle-step-tabs" aria-label="자막 처리 단계">{SUBTITLE_STEPS.map((step) => <span className={currentStepKey === step.key ? 'step-tab is-selected' : 'step-tab'} key={step.key}>{step.label}</span>)}</div>
      <ProgressMeter filledCells={filledProgressCells} value={statusJob.progress} />
    </section>;
  }

  if (viewPhase === 'result') {
    return <section className="console-panel phase-panel status-panel" aria-labelledby="subtitle-result-title">
      <PanelTitle icon="completed" id="subtitle-result-title">SRT 준비 완료</PanelTitle>
      <StatusHead icon="completed" tone="completed" title={statusTitle} message={statusMessage} />
      <div className="result-actions"><a className="download-button" href={downloadHref}><PixelIcon name="download" />영어 SRT 다운로드</a><button className="secondary-button" type="button" onClick={returnToRequest}>새 요청</button></div>
    </section>;
  }

  return <section className="console-panel phase-panel status-panel" aria-labelledby="subtitle-error-title">
    <PanelTitle icon="failed" id="subtitle-error-title">요청을 완료하지 못했습니다</PanelTitle>
    <StatusHead icon="failed" tone="failed" title={statusTitle} message={statusMessage} isAlert />
    {workerHealthFailed ? <button className="secondary-button" disabled={workerHealthIsFetching} type="button" onClick={retryWorkerHealth}>다시 확인</button> : null}
    {statusErrorDetail ? <ErrorDetailsDisclosure detail={statusErrorDetail} /> : null}
    <button className="primary-button" type="button" onClick={returnToRequest}>요청 설정으로 돌아가기</button>
  </section>;
}

/** 화면별 panel heading을 일정한 구조로 렌더링한다. */
function PanelTitle(props: { /** 아이콘 이름. */ icon: PixelIconName; /** heading id. */ id: string; /** 제목. */ children: string }) {
  return <div className="panel-title-row"><h2 id={props.id}><PixelIcon name={props.icon} />{props.children}</h2><span className="title-dots" aria-hidden="true" /></div>;
}

/** 상태 제목과 안내 문구를 렌더링한다. */
function StatusHead(props: { /** 상태 아이콘. */ icon: PixelIconName; /** 상태 색상. */ tone: string; /** 상태 제목. */ title: string; /** 상태 설명. */ message: string; /** 오류 알림 여부. */ isAlert?: boolean }) {
  return <div className={`status-head status-head--${props.tone}`}><span className="status-icon" aria-hidden="true"><PixelIcon name={props.icon} /></span><div><h3>{props.title}</h3><p role={props.isAlert ? 'alert' : 'status'} aria-live="polite">{props.message}</p></div></div>;
}

/** 자막 job 진행률을 10칸 pixel meter로 렌더링한다. */
function ProgressMeter(props: { /** 채울 pixel cell 수. */ filledCells: number; /** API 진행률 값. */ value: number | null }) {
  return <div className="progress-meter" aria-label="진행률" aria-valuemax={100} aria-valuemin={0} aria-valuenow={props.value ?? undefined} role="progressbar">{Array.from({ length: 10 }).map((_, index) => <span className={index < props.filledCells ? 'is-filled' : ''} key={index} />)}</div>;
}
