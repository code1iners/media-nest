import { PixelIcon } from '../../components/pixel-art';
import { ErrorDetailsDisclosure } from '../../components/error-details-disclosure';
import {
  type SubtitleStepKey,
  useSubtitlesExtractLogic,
} from './_hooks/use-subtitles-extract-logic';

/** 자막 처리 상태에 표시할 단계 목록. */
const SUBTITLE_STEPS: Array<{
  /** 단계 key. */
  key: SubtitleStepKey;
  /** 화면 표시 라벨. */
  label: string;
}> = [
  { key: 'file_select', label: '파일 선택' },
  { key: 'queued', label: '대기' },
  { key: 'extracting_audio', label: '음성 추출' },
  { key: 'transcribing', label: 'SRT 생성' },
  { key: 'completed', label: '완료' },
];

/** 자막 추출 route page. */
export function SubtitlesExtractPage() {
  const {
    canSubmit,
    canChangeWhisperModel,
    clearSelectedFile,
    currentStepKey,
    downloadHref,
    fileInputRef,
    filledProgressCells,
    handleDropzoneDragOver,
    handleDropzoneDrop,
    handleFileInputChange,
    handleFilePickerOpen,
    handleSubtitleSubmit,
    handleWhisperModelChange,
    isSubtitlePending,
    processingEstimateMessage,
    retryWorkerHealth,
    selectedFile,
    selectedFileMeta,
    selectedWhisperModel,
    statusErrorDetail,
    statusIconName,
    statusJob,
    statusMessage,
    statusTitle,
    statusTone,
    validation,
    workerHealthFailed,
    workerHealthIsFetching,
  } = useSubtitlesExtractLogic();

  return (
    <div className="console-grid">
      <section className="console-panel" aria-labelledby="subtitles-title">
        <div className="panel-title-row panel-title-row--mint">
          <h2 id="subtitles-title">
            <PixelIcon name="subtitle" />
            영어 SRT 생성
          </h2>
          <span className="title-dots" aria-hidden="true" />
        </div>

        <div className="subtitle-form">
          <div className="field">
            <span className="field-label">로컬 영상 파일</span>
            <input
              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
              className="subtitle-file-input"
              ref={fileInputRef}
              type="file"
              onChange={handleFileInputChange}
            />
            <button
              className="subtitle-dropzone"
              type="button"
              onClick={handleFilePickerOpen}
              onDragOver={handleDropzoneDragOver}
              onDrop={handleDropzoneDrop}
            >
              <PixelIcon name="subtitle" />
              <strong>영상 선택 또는 드래그</strong>
              <span>mp4, mov, webm</span>
            </button>
          </div>

          {selectedFile ? (
            <div className="selected-file-row">
              <PixelIcon name="video" />
              <div>
                <strong>{selectedFile.name}</strong>
                <span>{selectedFileMeta}</span>
              </div>
              <button type="button" onClick={clearSelectedFile}>
                지우기
              </button>
            </div>
          ) : null}

          <fieldset className="segmented-control">
            <legend>Whisper 모델</legend>
            <label
              className={
                selectedWhisperModel === 'base_en'
                  ? 'segment is-selected'
                  : 'segment'
              }
            >
              <input
                checked={selectedWhisperModel === 'base_en'}
                disabled={!canChangeWhisperModel}
                name="subtitle-whisper-model"
                type="radio"
                value="base_en"
                onChange={handleWhisperModelChange}
              />
              <PixelIcon name="processing" />
              빠름 · base.en
            </label>
            <label
              className={
                selectedWhisperModel === 'small_en'
                  ? 'segment is-selected'
                  : 'segment'
              }
            >
              <input
                checked={selectedWhisperModel === 'small_en'}
                disabled={!canChangeWhisperModel}
                name="subtitle-whisper-model"
                type="radio"
                value="small_en"
                onChange={handleWhisperModelChange}
              />
              <PixelIcon name="subtitle" />
              정확도 · small.en
            </label>
          </fieldset>

          <p className="subtitle-estimate">{processingEstimateMessage}</p>

          <button
            className="primary-button"
            disabled={!canSubmit}
            type="button"
            onClick={handleSubtitleSubmit}
          >
            <PixelIcon name="subtitle" />
            {isSubtitlePending ? '요청 중' : '영어 SRT 생성'}
          </button>

          <div className="notice-box" role="note">
            <span aria-hidden="true">
              <PixelIcon name="info" />
            </span>
            <p>{validation.message}</p>
            <p>영어 SRT만 생성하며 번역은 완료 후 별도 단계에서 진행합니다.</p>
          </div>
        </div>
      </section>

      <section
        className="console-panel status-panel"
        aria-labelledby="subtitle-status-title"
      >
        <div className="panel-title-row panel-title-row--mint">
          <h2 id="subtitle-status-title">
            <PixelIcon name="processing" />
            처리 상태
          </h2>
          <span className="title-dots" aria-hidden="true" />
        </div>

        <div className={`status-head status-head--${statusTone}`}>
          <span className="status-icon" aria-hidden="true">
            <PixelIcon name={statusIconName} />
          </span>
          <div>
            <h3>{statusTitle}</h3>
            <p role="status">{statusMessage}</p>
          </div>
        </div>

        {workerHealthFailed ? (
          <button
            className="secondary-button"
            disabled={workerHealthIsFetching}
            type="button"
            onClick={retryWorkerHealth}
          >
            다시 확인
          </button>
        ) : null}

        {statusErrorDetail ? (
          <ErrorDetailsDisclosure detail={statusErrorDetail} />
        ) : null}

        <div className="subtitle-step-tabs" aria-label="자막 처리 단계">
          {SUBTITLE_STEPS.map((step) => (
            <span
              className={
                currentStepKey === step.key ? 'step-tab is-selected' : 'step-tab'
              }
              key={step.key}
            >
              {step.label}
            </span>
          ))}
        </div>

        <div
          className={`progress-meter progress-meter--${statusJob.displayStatus}`}
          aria-label="진행률"
        >
          {Array.from({ length: 10 }).map((_, index) => (
            <span
              className={index < filledProgressCells ? 'is-filled' : ''}
              key={index}
            />
          ))}
        </div>

        <div className="subtitle-result-actions">
          {downloadHref ? (
            <a className="download-button" href={downloadHref}>
              <PixelIcon name="download" />
              영어 SRT 다운로드
            </a>
          ) : (
            <button className="secondary-button" disabled type="button">
              <PixelIcon name="download" />
              영어 SRT 다운로드
            </button>
          )}
          <button className="secondary-button" disabled type="button">
            <PixelIcon name="subtitle" />
            한글로 번역
          </button>
        </div>
      </section>
    </div>
  );
}
