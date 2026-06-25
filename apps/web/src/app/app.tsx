import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  AUDIO_QUALITY_OPTIONS,
  type DownloadDraft,
  type DownloadDisplayStatus,
  type DownloadResponse,
  INITIAL_DOWNLOAD_DRAFT,
  VIDEO_QUALITY_OPTIONS,
  downloadDraftSchema,
  isTerminalStatus,
  validateDownloadDraft,
} from '../domain/download-request/download-request';
import {
  type UserVisibleErrorDetail,
  WorkerUnavailableError,
  assertWorkerAvailable,
  buildApiUrl,
  createDownloadJob,
  getWorkerHealth,
  waitForDownloadJob,
} from '../api/mytube-extract.api';
import { ErrorDetailsDisclosure } from './error-details-disclosure';
import { PixelExtractorArt, PixelIcon, type PixelIconName } from './pixel-art';

/** worker 미가용 안내 문구. */
const WORKER_UNAVAILABLE_MESSAGE =
  '현재 추출 서버가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.';

/** worker 미가용 상세 원인. */
const WORKER_UNAVAILABLE_DETAIL: UserVisibleErrorDetail = {
  code: 'WORKER_UNAVAILABLE',
  guidance: '추출 서버가 작업을 받을 수 없는 상태입니다.',
  location: '서비스 상태 확인',
  requestPath: '/health',
};

/** worker health query polling 간격. */
const WORKER_HEALTH_REFETCH_INTERVAL_MS = 15_000;

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

/** MyTube Extract Vite CSR web app. */
export function App() {
  // Variables.

  /** 현재 API base URL. */
  const apiBaseUrl = getApiBaseUrl();

  // States.

  /** 현재 생성되어 진행 중이거나 완료된 다운로드 job. */
  const [activeJob, setActiveJob] = useState<DownloadResponse | null>(null);
  /** 요청 실패 메시지. */
  const [requestError, setRequestError] = useState('');

  // Refs.

  /** 현재 polling을 중단하기 위한 컨트롤러. */
  const pollingAbortControllerRef = useRef<AbortController | null>(null);

  // Hooks.

  /** 다운로드 입력 form 상태. */
  const {
    handleSubmit,
    register,
    setFocus,
    setValue,
    watch,
    formState: { isValid },
  } = useForm<DownloadDraft>({
    defaultValues: INITIAL_DOWNLOAD_DRAFT,
    mode: 'onChange',
    resolver: zodResolver(downloadDraftSchema),
  });
  /** worker health query. */
  const workerHealthQuery = useQuery({
    queryKey: ['worker-health', apiBaseUrl],
    queryFn: () => getWorkerHealth({ apiBaseUrl }),
    refetchInterval: WORKER_HEALTH_REFETCH_INTERVAL_MS,
    retry: false,
  });
  /** 다운로드 job 생성 mutation. */
  const downloadJobMutation = useMutation({
    mutationFn: async (input: {
      /** 다운로드 입력값. */
      draft: DownloadDraft;
      /** 요청 중단 신호. */
      signal: AbortSignal;
    }) => {
      /** submit 직전 최신 worker health. */
      const workerHealth = await workerHealthQuery.refetch();

      if (workerHealth.error) {
        throw workerHealth.error;
      }

      assertWorkerAvailable(workerHealth.data);

      return createDownloadJob(input.draft, {
        apiBaseUrl,
        signal: input.signal,
      });
    },
  });

  // Computed.

  /** 현재 form 입력값. */
  const draft = watch();
  /** 현재 입력 검증 결과. */
  const validation = validateDownloadDraft(draft);
  /** 현재 품질 선택지. */
  const qualityOptions =
    draft.mode === 'audio' ? AUDIO_QUALITY_OPTIONS : VIDEO_QUALITY_OPTIONS;
  /** terminal 상태가 아닌 job 진행 여부. */
  const jobInProgress =
    !!activeJob && !isTerminalStatus(activeJob.displayStatus);
  /** worker가 미가용 상태인지 여부. */
  const workerUnavailable =
    workerHealthQuery.data?.worker?.available === false;
  /** worker health 확인에 실패했는지 여부. */
  const workerHealthFailed = workerHealthQuery.isError;
  /** worker health 확인 중인지 여부. */
  const workerHealthChecking = workerHealthQuery.isPending;
  /** worker health 오류 상세 원인. */
  const workerHealthErrorDetail = createWorkerHealthErrorDetail(
    workerHealthQuery.error,
  );
  /** 현재 상태 패널 상세 원인. */
  const statusErrorDetail = workerUnavailable
    ? WORKER_UNAVAILABLE_DETAIL
    : workerHealthErrorDetail;
  /** 추출 요청 가능 여부. */
  const canSubmit =
    validation.kind === 'ready' &&
    isValid &&
    !jobInProgress &&
    !downloadJobMutation.isPending &&
    workerHealthQuery.data?.worker?.available === true;
  /** 오른쪽 status panel에 표시할 job. */
  const statusJob = activeJob ?? createIdleJob(draft);
  /** 10칸 진행률 bar 중 채울 칸 수. */
  const filledProgressCells =
    statusJob.progress === null ? 0 : Math.round(statusJob.progress / 10);
  /** 현재 상태 제목. */
  const statusTitle =
    createWorkerHealthTitle({
      failed: workerHealthFailed,
      unavailable: workerUnavailable,
    }) || createStatusTitle(statusJob);
  /** 현재 상태 문구. */
  const statusMessage =
    createWorkerHealthMessage({
      failed: workerHealthFailed,
      pending: workerHealthChecking,
      unavailable: workerUnavailable,
    }) ||
    requestError ||
    statusJob.message ||
    validation.message;
  /** 요청 시작 시각 표시값. */
  const createdTime = formatTime(statusJob.createdAt);
  /** 현재 상태 아이콘 이름. */
  const statusIconName =
    workerHealthFailed || workerUnavailable
      ? 'failed'
      : getStatusIconName(statusJob.displayStatus);
  /** 현재 상태 표시 tone. */
  const statusTone =
    workerHealthFailed || workerUnavailable ? 'failed' : statusJob.displayStatus;
  /** 현재 진행률 표시 문구. */
  const progressLabel = createProgressLabel(statusJob);

  // Functions.

  /** API base URL 환경 설정을 반환한다. */
  function getApiBaseUrl() {
    return (
      import.meta.env.VITE_MYTUBE_EXTRACT_API_BASE_URL ??
      import.meta.env.VITE_MEDIA_NEST_API_BASE_URL
    );
  }

  /** 현재 polling만 중단한다. */
  function stopPolling() {
    pollingAbortControllerRef.current?.abort();
    pollingAbortControllerRef.current = null;
  }

  /** 입력 변경 후 이전 실패 상태를 초기화한다. */
  function clearRequestError() {
    if (jobInProgress) {
      return;
    }

    setRequestError('');
  }

  /** worker health를 다시 확인한다. */
  function retryWorkerHealth() {
    void workerHealthQuery.refetch();
  }

  // Effects.

  useEffect(function cleanupDownloadPolling() {
    return () => {
      stopPolling();
    };
  }, []);

  // Handlers.

  /** 다운로드 형식 변경 이벤트를 처리한다. */
  function handleModeChange() {
    clearRequestError();
    setValue('quality', 'default', {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  /** YouTube URL 입력값을 비우고 다시 입력할 수 있게 focus를 돌린다. */
  function handleSourceUrlReset() {
    clearRequestError();
    setValue('sourceUrl', '', {
      shouldDirty: true,
      shouldValidate: true,
    });
    setFocus('sourceUrl');
  }

  /** 다운로드 실행 submit 이벤트를 처리한다. */
  async function handleDownloadSubmit(validDraft: DownloadDraft) {
    stopPolling();
    setRequestError('');

    try {
      /** 새 다운로드 job polling 컨트롤러. */
      const abortController = new AbortController();
      pollingAbortControllerRef.current = abortController;

      /** 생성된 다운로드 job. */
      const job = await downloadJobMutation.mutateAsync({
        draft: validDraft,
        signal: abortController.signal,
      });

      setActiveJob(job);

      /** terminal 상태까지 polling한 최종 job. */
      const finalJob = await waitForDownloadJob(job, {
        apiBaseUrl,
        signal: abortController.signal,
        onStatus: setActiveJob,
      });

      setActiveJob(finalJob);
      stopPolling();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setRequestError(
        error instanceof WorkerUnavailableError
          ? WORKER_UNAVAILABLE_MESSAGE
          : '추출 요청에 실패했습니다. 다시 시도해 주세요.',
      );
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-labelledby="page-title">
        <header className="console-hero">
          <div className="brand-lockup">
            <p className="brand-kicker">PIXEL EXTRACTION CONSOLE</p>
            <h1 id="page-title" className="page-title">
              MyTube <span>Extract</span>
            </h1>
            <p className="hero-copy">
              YouTube URL을 제출하면 순서대로 파일을 준비합니다.
            </p>
          </div>
          <div className="pixel-extractor" aria-hidden="true">
            <PixelExtractorArt />
          </div>
        </header>

        <div className="console-grid">
          <section className="console-panel" aria-labelledby="request-title">
            <div className="panel-title-row">
              <h2 id="request-title">
                <PixelIcon name="download" />
                추출 요청
              </h2>
              <span className="title-dots" aria-hidden="true" />
            </div>

            <form
              className="download-form"
              onSubmit={handleSubmit(handleDownloadSubmit)}
            >
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
                {downloadJobMutation.isPending ? '요청 중' : '추출 요청'}
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

            <div
              className={`status-head status-head--${statusTone}`}
            >
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
                disabled={workerHealthQuery.isFetching}
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
                <dd>{statusJob.type === 'audio' ? '오디오' : '비디오'}</dd>
              </div>
              <div>
                <dt>품질</dt>
                <dd>{formatQuality(statusJob)}</dd>
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

            {statusJob.downloadUrl ? (
              <a
                className="download-button"
                download={createDownloadFileName(statusJob)}
                href={buildApiUrl(statusJob.downloadUrl, getApiBaseUrl())}
              >
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
      </section>
    </main>
  );
}

/** 빈 화면용 임시 상태 job을 만든다. */
function createIdleJob(draft: DownloadDraft): DownloadResponse {
  return {
    createdAt: new Date().toISOString(),
    displayStatus: 'queued',
    downloadUrl: null,
    errorCode: null,
    jobId: '',
    message: 'YouTube URL을 입력하고 추출을 요청해 주세요.',
    progress: 0,
    quality: draft.quality,
    retentionDays: 7,
    status: 'queued',
    type: draft.mode,
  };
}

/** 상태 제목을 만든다. */
function createStatusTitle(job: DownloadResponse) {
  if (job.displayStatus === 'queued') {
    return '작업 대기 중입니다';
  }

  if (job.displayStatus === 'processing') {
    return '파일을 추출 중입니다';
  }

  if (job.displayStatus === 'completed') {
    return '파일이 준비되었습니다';
  }

  if (job.displayStatus === 'failed') {
    return '추출에 실패했습니다';
  }

  return '보관 기간이 지났습니다';
}

/** 표시 상태에 맞는 픽셀 아이콘 이름을 반환한다. */
function getStatusIconName(status: DownloadDisplayStatus): PixelIconName {
  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'failed') {
    return 'failed';
  }

  if (status === 'expired') {
    return 'expired';
  }

  if (status === 'processing') {
    return 'processing';
  }

  return 'queued';
}

/** 진행률 상태 문구를 만든다. */
function createProgressLabel(job: DownloadResponse) {
  if (job.progress === null) {
    return '--';
  }

  if (job.displayStatus === 'queued') {
    return '대기 중';
  }

  return `${job.progress}%`;
}

/** worker health 상태 제목을 만든다. */
function createWorkerHealthTitle(input: {
  /** worker health 확인 실패 여부. */
  failed: boolean;
  /** worker 미가용 여부. */
  unavailable: boolean;
}) {
  if (input.unavailable) {
    return '추출 기능을 사용할 수 없습니다';
  }

  if (input.failed) {
    return '서비스 상태를 확인할 수 없습니다';
  }

  return '';
}

/** worker health 상태 문구를 만든다. */
function createWorkerHealthMessage(input: {
  /** worker health 확인 실패 여부. */
  failed: boolean;
  /** worker health 첫 확인 진행 여부. */
  pending: boolean;
  /** worker 미가용 여부. */
  unavailable: boolean;
}) {
  if (input.unavailable) {
    return WORKER_UNAVAILABLE_MESSAGE;
  }

  if (input.failed) {
    return '서버 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  }

  if (input.pending) {
    return '서비스 상태를 확인 중입니다.';
  }

  return '';
}

/** worker health 오류에서 사용자 열람용 상세 정보를 만든다. */
function createWorkerHealthErrorDetail(
  error: Error | null,
): UserVisibleErrorDetail | undefined {
  if (!error) {
    return undefined;
  }

  if (hasUserVisibleErrorDetail(error)) {
    return error.detail;
  }

  return {
    code: 'SERVICE_STATUS_CHECK_FAILED',
    guidance: '서비스 상태를 확인할 수 없습니다.',
    location: '서비스 상태 확인',
    requestPath: '/health',
    responseBody: error.message,
  };
}

/** 오류 객체가 사용자 열람용 상세 정보를 포함하는지 확인한다. */
function hasUserVisibleErrorDetail(
  error: unknown,
): error is { detail: UserVisibleErrorDetail } {
  return (
    !!error &&
    typeof error === 'object' &&
    'detail' in error &&
    !!error.detail
  );
}

/** 요청 시각을 HH:mm 형식으로 표시한다. */
function formatTime(value: string) {
  /** 날짜 파싱 결과. */
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** 품질 표시값을 만든다. */
function formatQuality(job: DownloadResponse) {
  if (job.quality === 'default') {
    return '기본값';
  }

  return job.type === 'audio' ? `${job.quality} kbps` : `${job.quality}p`;
}

/** 다운로드 링크에 전달할 기본 파일명을 만든다. */
function createDownloadFileName(job: DownloadResponse) {
  /** 추출 형식에 맞는 파일 확장자. */
  const extension = job.type === 'audio' ? 'mp3' : 'mp4';

  return `mytube-${job.jobId}.${extension}`;
}
