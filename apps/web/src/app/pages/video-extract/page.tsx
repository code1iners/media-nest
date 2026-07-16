import { type DownloadDisplayStatus } from '../../../domain/download-request/download-request';
import { ErrorDetailsDisclosure } from '../../components/error-details-disclosure';
import { PixelIcon, type PixelIconName } from '../../components/pixel-art';
import { useVideoExtractLogic } from './_hooks/use-video-extract-logic';

/** 처리 화면에서 표시할 영상 추출 단계. */
const STATUS_ITEMS = [
  { icon: 'queued', key: 'queued', label: '대기' },
  { icon: 'processing', key: 'processing', label: '처리' },
  { icon: 'completed', key: 'completed', label: '완료' },
] as const satisfies Array<{
  /** 상태 아이콘 이름. */
  icon: PixelIconName;
  /** 표시 상태 key. */
  key: DownloadDisplayStatus;
  /** 화면 라벨. */
  label: string;
}>;

/** 영상 추출 route page. */
export function VideoExtractPage() {
  // Hooks.

  /** 영상 추출 form, job 상태, 사용자 동작. */
  const {
    canSubmit,
    clearRequestError,
    createdTime,
    downloadHref,
    draft,
    filledProgressCells,
    handleDownloadFormSubmit,
    handleModeChange,
    handleSourceUrlReset,
    isDownloadPending,
    progressLabel,
    qualityOptions,
    register,
    retryWorkerHealth,
    requestAvailabilityNotice,
    returnToRequest,
    statusErrorDetail,
    statusIconName,
    statusJob,
    statusMessage,
    statusQualityLabel,
    statusTitle,
    statusTone,
    statusTypeLabel,
    validation,
    viewPhase,
    workerHealthFailed,
    workerHealthIsFetching,
  } = useVideoExtractLogic();

  if (viewPhase === 'request') {
    return (
      <section className="console-panel phase-panel" aria-labelledby="request-title">
        <PanelTitle icon="download" id="request-title">추출 요청</PanelTitle>

        <form className="download-form" onSubmit={handleDownloadFormSubmit}>
          <label className={validation.kind === 'invalid' ? 'field field--wide has-error' : 'field field--wide'}>
            <span className="field-label">YouTube URL</span>
            <span className="url-input-frame">
              <PixelIcon className="input-icon" name="link" />
              <input
                autoComplete="off"
                aria-describedby={validation.kind === 'ready' ? undefined : 'video-source-url-feedback'}
                aria-invalid={validation.kind === 'invalid' || undefined}
                placeholder="https://www.youtube.com/watch?v=..."
                type="url"
                {...register('sourceUrl', { onChange: clearRequestError })}
              />
              <button
                className="url-reset-button"
                disabled={!draft.sourceUrl}
                type="button"
                onClick={handleSourceUrlReset}
              >
                리셋
              </button>
            </span>
            {validation.kind !== 'ready' ? <p className={validation.kind === 'invalid' ? 'field-feedback field-feedback--error' : 'field-feedback'} id="video-source-url-feedback" role={validation.kind === 'invalid' ? 'alert' : undefined}>{validation.message}</p> : null}
          </label>

          <fieldset className="segmented-control">
            <legend>추출 형식</legend>
            <label className={draft.mode === 'audio' ? 'segment is-selected' : 'segment'}>
              <input checked={draft.mode === 'audio'} type="radio" value="audio" {...register('mode', { onChange: handleModeChange })} />
              <PixelIcon name="audio" />
              오디오 (MP3)
            </label>
            <label className={draft.mode === 'video' ? 'segment is-selected' : 'segment'}>
              <input checked={draft.mode === 'video'} type="radio" value="video" {...register('mode', { onChange: handleModeChange })} />
              <PixelIcon name="video" />
              비디오 (MP4)
            </label>
          </fieldset>

          <fieldset className="quality-grid">
            <legend>품질</legend>
            {qualityOptions.map((option) => (
              <label className={draft.quality === option.value ? 'quality-chip is-selected' : 'quality-chip'} key={option.value}>
                <input type="radio" value={option.value} {...register('quality', { onChange: clearRequestError })} />
                {option.label}
              </label>
            ))}
          </fieldset>

          <button className="primary-button" disabled={!canSubmit} type="submit">
            <PixelIcon name="download" />
            {isDownloadPending ? '요청 중' : '추출 요청'}
          </button>
        </form>

        {requestAvailabilityNotice ? (
          <div className="notice-box" role={requestAvailabilityNotice.role}>
            <span aria-hidden="true"><PixelIcon name={requestAvailabilityNotice.role === 'status' ? 'processing' : 'failed'} /></span>
            <p>{requestAvailabilityNotice.message}</p>
            {requestAvailabilityNotice.showRetry ? <button
              className="secondary-button secondary-button--compact"
              disabled={workerHealthIsFetching}
              type="button"
              onClick={retryWorkerHealth}
            >
              다시 확인
            </button> : null}
          </div>
        ) : null}

        <div className="notice-box" role="note">
          <span aria-hidden="true"><PixelIcon name="info" /></span>
          <p>즉시 다운로드가 아니라 작업 요청 방식입니다.</p>
          <p>파일은 준비 후 일정 시간 뒤 삭제될 수 있습니다.</p>
        </div>
      </section>
    );
  }

  if (viewPhase === 'processing') {
    return (
      <section className="console-panel phase-panel status-panel" aria-labelledby="status-title">
        <PanelTitle icon="processing" id="status-title">처리 상태</PanelTitle>
        <StatusHead icon={statusIconName} tone={statusTone} title={statusTitle} message={statusMessage} />
        <div className="step-tabs" aria-label="작업 단계">
          {STATUS_ITEMS.map((item) => (
            <span className={statusJob.displayStatus === item.key ? 'step-tab is-selected' : 'step-tab'} key={item.key}>
              <PixelIcon name={item.icon} />
              {item.label}
            </span>
          ))}
        </div>
        <ProgressMeter filledCells={filledProgressCells} label={progressLabel} value={statusJob.progress} />
        <dl className="status-details">
          <div><dt>형식</dt><dd>{statusTypeLabel}</dd></div>
          <div><dt>품질</dt><dd>{statusQualityLabel}</dd></div>
          <div><dt>요청 시작</dt><dd>{createdTime}</dd></div>
          <div><dt>보관 기간</dt><dd>완료 후 {statusJob.retentionDays}일</dd></div>
        </dl>
      </section>
    );
  }

  if (viewPhase === 'result') {
    return (
      <section className="console-panel phase-panel status-panel" aria-labelledby="result-title">
        <PanelTitle icon="completed" id="result-title">추출 완료</PanelTitle>
        <StatusHead icon="completed" tone="completed" title={statusTitle} message={statusMessage} />
        <dl className="status-details">
          <div><dt>형식</dt><dd>{statusTypeLabel}</dd></div>
          <div><dt>품질</dt><dd>{statusQualityLabel}</dd></div>
          <div><dt>보관 기간</dt><dd>완료 후 {statusJob.retentionDays}일</dd></div>
        </dl>
        <div className="result-actions">
          <a className="download-button" href={downloadHref}><PixelIcon name="download" />다운로드</a>
          <button className="secondary-button" type="button" onClick={returnToRequest}>새 요청</button>
        </div>
      </section>
    );
  }

  return (
    <section className="console-panel phase-panel status-panel" aria-labelledby="error-title">
      <PanelTitle icon="failed" id="error-title">요청을 완료하지 못했습니다</PanelTitle>
      <StatusHead icon="failed" tone="failed" title={statusTitle} message={statusMessage} isAlert />
      {workerHealthFailed ? (
        <button className="secondary-button" disabled={workerHealthIsFetching} type="button" onClick={retryWorkerHealth}>다시 확인</button>
      ) : null}
      {statusErrorDetail ? <ErrorDetailsDisclosure detail={statusErrorDetail} /> : null}
      <button className="primary-button" type="button" onClick={returnToRequest}>요청 설정으로 돌아가기</button>
    </section>
  );
}

/** 화면별 panel heading을 일정한 구조로 렌더링한다. */
function PanelTitle(props: { /** 아이콘 이름. */ icon: PixelIconName; /** heading id. */ id: string; /** 제목. */ children: string }) {
  return <div className="panel-title-row"><h2 id={props.id}><PixelIcon name={props.icon} />{props.children}</h2><span className="title-dots" aria-hidden="true" /></div>;
}

/** 상태 제목과 안내 문구를 렌더링한다. */
function StatusHead(props: { /** 상태 아이콘. */ icon: PixelIconName; /** 상태 색상. */ tone: string; /** 상태 제목. */ title: string; /** 상태 설명. */ message: string; /** 오류 알림 여부. */ isAlert?: boolean }) {
  return <div className={`status-head status-head--${props.tone}`}><span className="status-icon" aria-hidden="true"><PixelIcon name={props.icon} /></span><div><h3>{props.title}</h3><p role={props.isAlert ? 'alert' : 'status'} aria-live="polite">{props.message}</p></div></div>;
}

/** 10칸 진행률과 보조 텍스트를 렌더링한다. */
function ProgressMeter(props: { /** 채울 pixel cell 수. */ filledCells: number; /** 진행률 라벨. */ label: string; /** API 진행률 값. */ value: number | null }) {
  return <><div className="progress-meter" aria-label="진행률" aria-valuemax={100} aria-valuemin={0} aria-valuenow={props.value ?? undefined} role="progressbar">{Array.from({ length: 10 }).map((_, index) => <span className={index < props.filledCells ? 'is-filled' : ''} key={index} />)}</div><p className="progress-label">{props.label}</p></>;
}
