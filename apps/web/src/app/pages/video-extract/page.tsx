import { type DownloadDisplayStatus } from '../../../domain/download-request/download-request';
import { ErrorDetailsDisclosure } from '../../components/error-details-disclosure';
import { PixelIcon, type PixelIconName } from '../../components/pixel-art';
import { useVideoExtractLogic } from './_hooks/use-video-extract-logic';

/** 상태 표시 메타데이터. */
const STATUS_ITEMS = [
  { icon: 'queued', key: 'queued', label: '대기' },
  { icon: 'processing', key: 'processing', label: '처리' },
  { icon: 'completed', key: 'completed', label: '완료' },
  { icon: 'expired', key: 'expired', label: '만료' },
] as const satisfies Array<{
  /** 상태 아이콘 이름. */
  icon: PixelIconName;
  /** 표시 상태 key. */
  key: DownloadDisplayStatus;
  /** 탭 라벨. */
  label: string;
}>;

/** 하단 상태 안내 메타데이터. */
const STATUS_LEGEND_ITEMS = [
  {
    description: '요청 접수',
    icon: 'queued',
    key: 'queued',
    label: '대기',
  },
  {
    description: '파일 추출 중',
    icon: 'processing',
    key: 'processing',
    label: '처리',
  },
  {
    description: '다운로드 가능',
    icon: 'completed',
    key: 'completed',
    label: '완료',
  },
  {
    description: '재시도 필요',
    icon: 'failed',
    key: 'failed',
    label: '실패',
  },
  {
    description: '재추출 필요',
    icon: 'expired',
    key: 'expired',
    label: '만료',
  },
] as const;

/** 영상 추출 route page. */
export function VideoExtractPage() {
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
    statusErrorDetail,
    statusIconName,
    statusJob,
    statusMessage,
    statusQualityLabel,
    statusTitle,
    statusTone,
    statusTypeLabel,
    workerHealthFailed,
    workerHealthIsFetching,
  } = useVideoExtractLogic();

  return (
    <>
      <div className="console-grid">
        <section className="console-panel" aria-labelledby="request-title">
          <div className="panel-title-row">
            <h2 id="request-title">
              <PixelIcon name="download" />
              추출 요청
            </h2>
            <span className="title-dots" aria-hidden="true" />
          </div>

          <form className="download-form" onSubmit={handleDownloadFormSubmit}>
            <label className="field field--wide">
              <span className="field-label">YouTube URL</span>
              <span className="url-input-frame">
                <PixelIcon className="input-icon" name="link" />
                <input
                  autoComplete="off"
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
            </label>

            <fieldset className="segmented-control">
              <legend>추출 형식</legend>
              <label
                className={
                  draft.mode === 'audio' ? 'segment is-selected' : 'segment'
                }
              >
                <input
                  checked={draft.mode === 'audio'}
                  type="radio"
                  value="audio"
                  {...register('mode', { onChange: handleModeChange })}
                />
                <PixelIcon name="audio" />
                오디오 (MP3)
              </label>
              <label
                className={
                  draft.mode === 'video' ? 'segment is-selected' : 'segment'
                }
              >
                <input
                  checked={draft.mode === 'video'}
                  type="radio"
                  value="video"
                  {...register('mode', { onChange: handleModeChange })}
                />
                <PixelIcon name="video" />
                비디오 (MP4)
              </label>
            </fieldset>

            <fieldset className="quality-grid">
              <legend>품질</legend>
              {qualityOptions.map((option) => (
                <label
                  className={
                    draft.quality === option.value
                      ? 'quality-chip is-selected'
                      : 'quality-chip'
                  }
                  key={option.value}
                >
                  <input
                    type="radio"
                    value={option.value}
                    {...register('quality', { onChange: clearRequestError })}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>

            <button
              className="primary-button"
              disabled={!canSubmit}
              type="submit"
            >
              <PixelIcon name="download" />
              {isDownloadPending ? '요청 중' : '추출 요청'}
            </button>
          </form>

          <div className="notice-box" role="note">
            <span aria-hidden="true">
              <PixelIcon name="info" />
            </span>
            <p>즉시 다운로드가 아니라 작업 요청 방식입니다.</p>
            <p>파일은 준비 후 일정 시간 뒤 삭제될 수 있습니다.</p>
          </div>
        </section>

        <section
          className="console-panel status-panel"
          aria-labelledby="status-title"
        >
          <div className="panel-title-row panel-title-row--mint">
            <h2 id="status-title">
              <PixelIcon name="processing" />
              작업 현황
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

          <div className="step-tabs" aria-label="작업 단계">
            {STATUS_ITEMS.map((item) => (
              <span
                className={
                  statusJob.displayStatus === item.key
                    ? 'step-tab is-selected'
                    : 'step-tab'
                }
                key={item.key}
              >
                <PixelIcon name={item.icon} />
                {item.label}
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
          <p className="progress-label">{progressLabel}</p>

          <dl className="status-details">
            <div>
              <dt>형식</dt>
              <dd>{statusTypeLabel}</dd>
            </div>
            <div>
              <dt>품질</dt>
              <dd>{statusQualityLabel}</dd>
            </div>
            <div>
              <dt>요청 시작</dt>
              <dd>{createdTime}</dd>
            </div>
            <div>
              <dt>보관 기간</dt>
              <dd>완료 후 {statusJob.retentionDays}일</dd>
            </div>
          </dl>

          {downloadHref ? (
            <a className="download-button" href={downloadHref}>
              <PixelIcon name="download" />
              다운로드
            </a>
          ) : null}
        </section>
      </div>

      <section className="legend-bar" aria-label="상태 안내">
        <span className="legend-title">상태 안내</span>
        {STATUS_LEGEND_ITEMS.map((item) => (
          <article
            className={`legend-item legend-item--${item.key}`}
            key={item.key}
          >
            <PixelIcon name={item.icon} />
            <strong>{item.label}</strong>
            <p>{item.description}</p>
          </article>
        ))}
      </section>
    </>
  );
}
