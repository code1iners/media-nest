import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  AUDIO_QUALITY_OPTIONS,
  type DownloadDraft,
  type DownloadDisplayStatus,
  type DownloadResponse,
  INITIAL_DOWNLOAD_DRAFT,
  VIDEO_QUALITY_OPTIONS,
  downloadDraftSchema,
  getDefaultDownloadQuality,
  isTerminalStatus,
  validateDownloadDraft,
} from '../../../../domain/download-request/download-request';
import {
  type UserVisibleErrorDetail,
  WorkerUnavailableError,
  assertWorkerAvailable,
  buildApiUrl,
  createDownloadJob,
  getWorkerHealth,
  waitForDownloadJob,
} from '../../../../api/mytube-extract.api';
import { useNavigationLock } from '../../../components/navigation-lock-context';
import { type PixelIconName } from '../../../components/pixel-art';
import { getExtractViewPhase } from '../../../utils/extract-view-phase.util';
import { getWorkerHealthNotice } from '../../../utils/worker-health-notice.util';

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

/** 영상 추출 route의 form, polling, 표시 상태를 조합한다. */
export function useVideoExtractLogic() {
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
  /** 추출 진행 중 route 이동 차단 상태를 갱신한다. */
  const { setNavigationLocked } = useNavigationLock();

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
  /** 완료 화면을 유지할 API job 여부. */
  const hasCompletedJob = activeJob?.displayStatus === 'completed';
  /** route를 벗어나면 안 되는 추출 요청/진행 상태 여부. */
  const extractionNavigationLocked =
    downloadJobMutation.isPending || jobInProgress;
  /** worker가 미가용 상태인지 여부. */
  const workerUnavailable = workerHealthQuery.data?.worker?.available === false;
  /** worker health 확인에 실패했는지 여부. */
  const workerHealthFailed = workerHealthQuery.isError;
  /** worker health 확인 중인지 여부. */
  const workerHealthChecking = workerHealthQuery.isPending;
  /** 요청 설정 화면에 표시할 worker health 안내. */
  const requestAvailabilityNotice = getWorkerHealthNotice({
    failed: workerHealthFailed,
    pending: workerHealthChecking,
    unavailable: workerUnavailable,
    unavailableMessage: WORKER_UNAVAILABLE_MESSAGE,
  });
  /** API job 생성 전 요청 처리 중인지 여부. */
  const isSubmitting = downloadJobMutation.isPending;
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
    (isSubmitting ? '추출 요청을 준비하고 있습니다' : '') ||
    (hasCompletedJob ? createStatusTitle(statusJob) : '') ||
    createWorkerHealthTitle({
      failed: workerHealthFailed,
      unavailable: workerUnavailable,
    }) ||
    createStatusTitle(statusJob);
  /** 현재 상태 문구. */
  const statusMessage =
    (isSubmitting ? '추출 서버 상태를 확인하고 작업을 생성 중입니다.' : '') ||
    (hasCompletedJob ? statusJob.message : '') ||
    requestAvailabilityNotice?.message ||
    requestError ||
    statusJob.message ||
    validation.message;
  /** 요청 시작 시각 표시값. */
  const createdTime = formatTime(statusJob.createdAt);
  /** 현재 상태 아이콘 이름. */
  const statusIconName =
    isSubmitting
      ? 'processing'
      : hasCompletedJob
        ? getStatusIconName(statusJob.displayStatus)
        : workerHealthFailed || workerUnavailable
          ? 'failed'
          : getStatusIconName(statusJob.displayStatus);
  /** 현재 상태 표시 tone. */
  const statusTone =
    isSubmitting
      ? 'processing'
      : hasCompletedJob
        ? statusJob.displayStatus
        : workerHealthFailed || workerUnavailable
          ? 'failed'
          : statusJob.displayStatus;
  /** 현재 진행률 표시 문구. */
  const progressLabel = createProgressLabel(statusJob);
  /** 상태 패널 형식 표시값. */
  const statusTypeLabel = statusJob.type === 'audio' ? '오디오' : '비디오';
  /** 상태 패널 품질 표시값. */
  const statusQualityLabel = formatQuality(statusJob);
  /** 완료 asset 다운로드 href. */
  const downloadHref = statusJob.downloadUrl
    ? buildApiUrl(statusJob.downloadUrl, apiBaseUrl)
    : '';
  /** 현재 화면에 단독으로 표시할 추출 단계. */
  const viewPhase = getExtractViewPhase({
    hasActiveJob: activeJob !== null,
    hasRequestError: Boolean(requestError),
    isSubmitting,
    hasWorkerHealthError: workerHealthFailed || workerUnavailable,
    status: activeJob?.displayStatus ?? null,
  });

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

  /** terminal 결과나 오류에서 기존 입력을 유지한 채 요청 화면으로 돌아간다. */
  function returnToRequest() {
    stopPolling();
    setActiveJob(null);
    setRequestError('');
    downloadJobMutation.reset();
  }

  // Effects.

  useEffect(
    function cleanupDownloadPolling() {
      return () => {
        stopPolling();
        setNavigationLocked(false);
      };
    },
    [setNavigationLocked],
  );

  useEffect(
    function syncExtractionNavigationLock() {
      setNavigationLocked(extractionNavigationLocked);
    },
    [extractionNavigationLocked, setNavigationLocked],
  );

  // Handlers.

  /** 다운로드 형식 변경 이벤트를 처리한다. */
  function handleModeChange(event: ChangeEvent<HTMLInputElement>) {
    clearRequestError();
    setValue(
      'quality',
      getDefaultDownloadQuality(event.target.value as DownloadDraft['mode']),
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    );
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

  return {
    canSubmit,
    clearRequestError,
    createdTime,
    downloadHref,
    draft,
    filledProgressCells,
    handleDownloadFormSubmit: handleSubmit(handleDownloadSubmit),
    handleModeChange,
    handleSourceUrlReset,
    isDownloadPending: downloadJobMutation.isPending,
    progressLabel,
    qualityOptions,
    register,
    requestAvailabilityNotice,
    retryWorkerHealth,
    statusErrorDetail,
    statusIconName,
    statusJob,
    statusMessage,
    statusQualityLabel,
    statusTitle,
    statusTone,
    statusTypeLabel,
    returnToRequest,
    validation,
    viewPhase,
    workerHealthFailed,
    workerHealthIsFetching: workerHealthQuery.isFetching,
  };
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
    !!error && typeof error === 'object' && 'detail' in error && !!error.detail
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
  return job.type === 'audio' ? `${job.quality} kbps` : `${job.quality}p`;
}
