import { useMutation, useQuery } from '@tanstack/react-query';
import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type SubtitleJobResponse,
  type SubtitleWhisperModel,
  createSubtitleProcessingEstimate,
  isSubtitleTerminalStatus,
  validateSubtitleFile,
} from '../../../../domain/subtitle-request/subtitle-request';
import {
  type UserVisibleErrorDetail,
  SubtitleUploadTooLargeError,
  WorkerUnavailableError,
  abortSubtitleUpload,
  assertWorkerAvailable,
  buildApiUrl,
  completeSubtitleUpload,
  createSubtitleUpload,
  getWorkerHealth,
  uploadSubtitleFileParts,
  waitForSubtitleJob,
} from '../../../../api/mytube-extract.api';
import { useNavigationLock } from '../../../components/navigation-lock-context';
import { type PixelIconName } from '../../../components/pixel-art';
import { getExtractViewPhase } from '../../../utils/extract-view-phase.util';
import { getWorkerHealthNotice } from '../../../utils/worker-health-notice.util';

/** worker 미가용 안내 문구. */
const WORKER_UNAVAILABLE_MESSAGE =
  '현재 자막 추출 서버가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.';

/** worker 미가용 상세 원인. */
const WORKER_UNAVAILABLE_DETAIL: UserVisibleErrorDetail = {
  code: 'WORKER_UNAVAILABLE',
  guidance: '자막 추출 서버가 작업을 받을 수 없는 상태입니다.',
  location: '서비스 상태 확인',
  requestPath: '/health',
};

/** worker health query polling 간격. */
const WORKER_HEALTH_REFETCH_INTERVAL_MS = 15_000;

/** 기본 Whisper 모델. */
const DEFAULT_WHISPER_MODEL: SubtitleWhisperModel = 'base_en';

/** 화면에 표시하는 자막 처리 단계. */
export type SubtitleStepKey = 'file_select' | SubtitleJobResponse['stage'];

/** 자막 추출 route의 file upload, polling, 표시 상태를 조합한다. */
export function useSubtitlesExtractLogic() {
  // Variables.

  /** 현재 API base URL. */
  const apiBaseUrl = getApiBaseUrl();

  // Refs.

  /** 파일 input DOM 참조. */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /** 현재 polling을 중단하기 위한 컨트롤러. */
  const pollingAbortControllerRef = useRef<AbortController | null>(null);

  // States.

  /** 사용자가 선택한 로컬 영상 파일. */
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  /** 현재 생성되어 진행 중이거나 완료된 자막 job. */
  const [activeJob, setActiveJob] = useState<SubtitleJobResponse | null>(null);
  /** 사용자가 선택한 Whisper 모델. */
  const [selectedWhisperModel, setSelectedWhisperModel] =
    useState<SubtitleWhisperModel>(DEFAULT_WHISPER_MODEL);
  /** 선택한 영상의 길이. */
  const [selectedVideoDurationSeconds, setSelectedVideoDurationSeconds] =
    useState<number | null>(null);
  /** 요청 실패 메시지. */
  const [requestError, setRequestError] = useState('');
  /** R2 direct upload 진행률. */
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Hooks.

  /** worker health query. */
  const workerHealthQuery = useQuery({
    queryKey: ['worker-health', apiBaseUrl],
    queryFn: () => getWorkerHealth({ apiBaseUrl }),
    refetchInterval: WORKER_HEALTH_REFETCH_INTERVAL_MS,
    retry: false,
  });
  /** 자막 job 생성 mutation. */
  const subtitleJobMutation = useMutation({
    mutationFn: async (input: {
      /** 업로드할 로컬 영상 파일. */
      file: File;
      /** 요청 중단 신호. */
      signal: AbortSignal;
    }) => {
      /** submit 직전 최신 worker health. */
      const workerHealth = await workerHealthQuery.refetch();

      if (workerHealth.error) {
        throw workerHealth.error;
      }

      assertWorkerAvailable(workerHealth.data);

      /** 생성된 R2 direct upload session. */
      let upload: Awaited<ReturnType<typeof createSubtitleUpload>> | null =
        null;

      try {
        upload = await createSubtitleUpload(input.file, selectedWhisperModel, {
          apiBaseUrl,
          signal: input.signal,
        });
        setUploadProgress(0);

        /** R2에 직접 업로드한 multipart part 목록. */
        const parts = await uploadSubtitleFileParts(input.file, upload, {
          signal: input.signal,
          onProgress: (progress) => setUploadProgress(progress.percent),
        });

        return completeSubtitleUpload(upload, parts, {
          apiBaseUrl,
          signal: input.signal,
        });
      } catch (error) {
        if (upload && !input.signal.aborted) {
          void abortSubtitleUpload(upload, { apiBaseUrl }).catch(() => {
            // 실패한 multipart upload 정리는 best-effort로만 수행한다.
          });
        }

        throw error;
      } finally {
        setUploadProgress(null);
      }
    },
  });
  /** 추출 진행 중 route 이동 차단 상태를 갱신한다. */
  const { setNavigationLocked } = useNavigationLock();

  // Computed.

  /** 현재 파일 입력 검증 결과. */
  const validation = validateSubtitleFile(selectedFile);
  /** terminal 상태가 아닌 job 진행 여부. */
  const jobInProgress =
    !!activeJob && !isSubtitleTerminalStatus(activeJob.displayStatus);
  /** 완료 화면을 유지할 API job 여부. */
  const hasCompletedJob = activeJob?.displayStatus === 'completed';
  /** route를 벗어나면 안 되는 자막 요청/진행 상태 여부. */
  const subtitleNavigationLocked =
    subtitleJobMutation.isPending || jobInProgress;
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
  /** R2 업로드 session 생성부터 자막 job 생성까지의 요청 처리 여부. */
  const isSubmitting = subtitleJobMutation.isPending;
  /** worker health 오류 상세 원인. */
  const workerHealthErrorDetail = createWorkerHealthErrorDetail(
    workerHealthQuery.error,
  );
  /** 자막 생성 요청 오류 상세 원인. */
  const requestErrorDetail =
    subtitleJobMutation.error instanceof Error &&
    hasUserVisibleErrorDetail(subtitleJobMutation.error)
      ? subtitleJobMutation.error.detail
      : undefined;
  /** 현재 상태 패널 상세 원인. */
  const statusErrorDetail = workerUnavailable
    ? WORKER_UNAVAILABLE_DETAIL
    : (workerHealthErrorDetail ?? requestErrorDetail);
  /** 자막 생성 요청 가능 여부. */
  const canSubmit =
    validation.kind === 'ready' &&
    !jobInProgress &&
    !subtitleJobMutation.isPending &&
    workerHealthQuery.data?.worker?.available === true;
  /** Whisper 모델 선택 가능 여부. */
  const canChangeWhisperModel =
    !jobInProgress && !subtitleJobMutation.isPending;
  /** 오른쪽 status panel에 표시할 job. */
  const statusJob = activeJob ?? createIdleSubtitleJob(selectedFile);
  /** 화면에 선택 표시할 처리 단계. */
  const currentStepKey = createSubtitleStepKey({
    selectedFile,
    statusJob,
    validationKind: validation.kind,
  });
  /** 10칸 진행률 bar 중 채울 칸 수. */
  const filledProgressCells =
    uploadProgress !== null
      ? Math.round(uploadProgress / 10)
      : statusJob.progress === null
        ? 0
        : Math.round(statusJob.progress / 10);
  /** 현재 상태 제목. */
  const statusTitle =
    (uploadProgress !== null ? '원본 영상을 업로드 중입니다' : '') ||
    (isSubmitting ? '자막 요청을 준비하고 있습니다' : '') ||
    (hasCompletedJob ? createStatusTitle(statusJob) : '') ||
    createWorkerHealthTitle({
      failed: workerHealthFailed,
      unavailable: workerUnavailable,
    }) ||
    createStatusTitle(statusJob);
  /** 현재 상태 문구. */
  const statusMessage =
    (uploadProgress !== null
      ? `R2로 원본 영상을 직접 업로드 중입니다. (${uploadProgress}%)`
      : '') ||
    (isSubmitting ? '추출 서버 상태를 확인하고 업로드를 준비 중입니다.' : '') ||
    (hasCompletedJob ? statusJob.message : '') ||
    requestAvailabilityNotice?.message ||
    requestError ||
    statusJob.message ||
    validation.message;
  /** 현재 상태 아이콘 이름. */
  const statusIconName =
    uploadProgress !== null || isSubmitting
      ? 'processing'
      : hasCompletedJob
        ? getStatusIconName(statusJob.displayStatus)
        : workerHealthFailed || workerUnavailable
          ? 'failed'
          : getStatusIconName(statusJob.displayStatus);
  /** 현재 상태 표시 tone. */
  const statusTone =
    uploadProgress !== null || isSubmitting
      ? 'processing'
      : hasCompletedJob
        ? getStatusTone(statusJob.displayStatus)
        : workerHealthFailed || workerUnavailable
          ? 'failed'
          : getStatusTone(statusJob.displayStatus);
  /** 완료 SRT 다운로드 href. */
  const downloadHref = statusJob.downloadUrl
    ? buildApiUrl(statusJob.downloadUrl, apiBaseUrl)
    : '';
  /** 선택 파일 메타 정보. */
  const selectedFileMeta = selectedFile
    ? `${formatFileSize(selectedFile.size)}`
    : '';
  /** 선택한 모델 기준 예상 처리 시간. */
  const processingEstimateMessage = createSubtitleProcessingEstimate(
    selectedVideoDurationSeconds,
    selectedWhisperModel,
  );
  /** 현재 화면에 단독으로 표시할 자막 추출 단계. */
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

  /** 선택 파일과 이전 실패 상태를 초기화한다. */
  function clearSelectedFile() {
    if (jobInProgress) {
      return;
    }

    setSelectedFile(null);
    setActiveJob(null);
    setSelectedVideoDurationSeconds(null);
    setRequestError('');
    setUploadProgress(null);
    subtitleJobMutation.reset();

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  /** 파일 선택을 상태에 반영한다. */
  function selectFile(file: File | null) {
    if (jobInProgress) {
      return;
    }

    setSelectedFile(file);
    setActiveJob(null);
    setSelectedVideoDurationSeconds(null);
    setRequestError('');
    setUploadProgress(null);
    subtitleJobMutation.reset();
  }

  /** worker health를 다시 확인한다. */
  function retryWorkerHealth() {
    void workerHealthQuery.refetch();
  }

  /** terminal 결과나 오류에서 선택 파일을 유지한 채 요청 화면으로 돌아간다. */
  function returnToRequest() {
    stopPolling();
    setActiveJob(null);
    setRequestError('');
    setUploadProgress(null);
    subtitleJobMutation.reset();
  }

  // Effects.

  useEffect(
    function readSelectedVideoDuration() {
      if (!selectedFile) {
        setSelectedVideoDurationSeconds(null);
        return;
      }

      /** 선택한 영상의 임시 browser URL. */
      const objectUrl = URL.createObjectURL(selectedFile);
      /** metadata만 읽을 video element. */
      const video = document.createElement('video');

      video.preload = 'metadata';
      video.src = objectUrl;
      video.onloadedmetadata = function handleLoadedMetadata() {
        setSelectedVideoDurationSeconds(
          Number.isFinite(video.duration) ? video.duration : null,
        );
        URL.revokeObjectURL(objectUrl);
      };
      video.onerror = function handleMetadataError() {
        setSelectedVideoDurationSeconds(null);
        URL.revokeObjectURL(objectUrl);
      };

      return () => {
        video.onloadedmetadata = null;
        video.onerror = null;
        URL.revokeObjectURL(objectUrl);
      };
    },
    [selectedFile],
  );

  useEffect(
    function cleanupSubtitlePolling() {
      return () => {
        stopPolling();
        setNavigationLocked(false);
      };
    },
    [setNavigationLocked],
  );

  useEffect(
    function syncSubtitleNavigationLock() {
      setNavigationLocked(subtitleNavigationLocked);
    },
    [setNavigationLocked, subtitleNavigationLocked],
  );

  // Handlers.

  /** 숨겨진 file input을 연다. */
  function handleFilePickerOpen() {
    if (jobInProgress) {
      return;
    }

    fileInputRef.current?.click();
  }

  /** 파일 input 변경 이벤트를 처리한다. */
  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0] ?? null);
  }

  /** dropzone dragover 기본 동작을 막는다. */
  function handleDropzoneDragOver(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  /** dropzone 파일 drop 이벤트를 처리한다. */
  function handleDropzoneDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    selectFile(event.dataTransfer.files[0] ?? null);
  }

  /** 자막 생성 submit 이벤트를 처리한다. */
  async function handleSubtitleSubmit() {
    if (!selectedFile || !canSubmit) {
      return;
    }

    stopPolling();
    setRequestError('');
    subtitleJobMutation.reset();

    try {
      /** 새 자막 job polling 컨트롤러. */
      const abortController = new AbortController();
      pollingAbortControllerRef.current = abortController;

      /** 생성된 자막 job. */
      const job = await subtitleJobMutation.mutateAsync({
        file: selectedFile,
        signal: abortController.signal,
      });

      setActiveJob(job);

      /** terminal 상태까지 polling한 최종 job. */
      const finalJob = await waitForSubtitleJob(job, {
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
          : error instanceof SubtitleUploadTooLargeError
            ? createSubtitleUploadTooLargeMessage(selectedFile)
            : error instanceof Error && hasUserVisibleErrorDetail(error)
              ? error.detail.guidance
              : '자막 생성 요청에 실패했습니다. 다시 시도해 주세요.',
      );
    }
  }

  /** Whisper 모델 변경 이벤트를 처리한다. */
  function handleWhisperModelChange(event: ChangeEvent<HTMLInputElement>) {
    if (jobInProgress) {
      return;
    }

    setSelectedWhisperModel(event.target.value as SubtitleWhisperModel);
  }

  return {
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
    isSubtitlePending: subtitleJobMutation.isPending,
    handleWhisperModelChange,
    processingEstimateMessage,
    retryWorkerHealth,
    requestAvailabilityNotice,
    selectedFile,
    selectedFileMeta,
    selectedWhisperModel,
    statusErrorDetail,
    statusIconName,
    statusJob,
    statusMessage,
    statusTitle,
    statusTone,
    returnToRequest,
    validation,
    viewPhase,
    workerHealthFailed,
    workerHealthIsFetching: workerHealthQuery.isFetching,
  };
}

/** 현재 화면 상태에서 선택 표시할 단계를 만든다. */
export function createSubtitleStepKey(input: {
  /** 현재 활성 job. */
  statusJob: SubtitleJobResponse;
  /** 사용자가 선택한 파일. */
  selectedFile: File | null;
  /** 현재 파일 검증 상태. */
  validationKind: ReturnType<typeof validateSubtitleFile>['kind'];
}): SubtitleStepKey {
  if (!input.statusJob.jobId && input.validationKind !== 'ready') {
    return 'file_select';
  }

  return input.statusJob.stage;
}

/** 빈 화면용 임시 상태 job을 만든다. */
function createIdleSubtitleJob(file: File | null): SubtitleJobResponse {
  return {
    createdAt: new Date().toISOString(),
    displayStatus: 'queued',
    downloadUrl: null,
    errorCode: null,
    fileName: file?.name ?? '',
    jobId: '',
    message: file
      ? '영어 SRT 생성 버튼을 누르면 작업이 시작됩니다.'
      : '영상 파일을 선택해 주세요.',
    progress: 0,
    retentionDays: 7,
    stage: 'queued',
    status: 'queued',
    whisperModel: DEFAULT_WHISPER_MODEL,
  };
}

/** 상태 제목을 만든다. */
function createStatusTitle(job: SubtitleJobResponse) {
  if (job.displayStatus === 'queued') {
    return '작업 대기 중입니다';
  }

  if (job.displayStatus === 'extracting_audio') {
    return '음성을 추출 중입니다';
  }

  if (job.displayStatus === 'transcribing') {
    return '영어 SRT를 생성 중입니다';
  }

  if (job.displayStatus === 'completed') {
    return '영어 SRT가 준비되었습니다';
  }

  if (job.displayStatus === 'failed') {
    return '자막 생성에 실패했습니다';
  }

  return '보관 기간이 지났습니다';
}

/** 표시 상태에 맞는 픽셀 아이콘 이름을 반환한다. */
function getStatusIconName(
  status: SubtitleJobResponse['displayStatus'],
): PixelIconName {
  if (status === 'completed') {
    return 'completed';
  }

  if (status === 'failed') {
    return 'failed';
  }

  if (status === 'expired') {
    return 'expired';
  }

  if (status === 'extracting_audio' || status === 'transcribing') {
    return 'processing';
  }

  return 'queued';
}

/** 기존 status CSS tone에 맞춰 자막 상태를 변환한다. */
function getStatusTone(status: SubtitleJobResponse['displayStatus']) {
  if (status === 'extracting_audio' || status === 'transcribing') {
    return 'processing';
  }

  return status;
}

/** worker health 상태 제목을 만든다. */
function createWorkerHealthTitle(input: {
  /** worker health 확인 실패 여부. */
  failed: boolean;
  /** worker 미가용 여부. */
  unavailable: boolean;
}) {
  if (input.unavailable) {
    return '자막 추출 기능을 사용할 수 없습니다';
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
    guidance: '서비스 상태 확인 중 문제가 발생했습니다.',
    location: '서비스 상태 확인',
    requestPath: '/health',
  };
}

/** 오류가 사용자 열람용 상세 정보를 포함하는지 확인한다. */
function hasUserVisibleErrorDetail(
  error: Error,
): error is Error & { detail: UserVisibleErrorDetail } {
  return (
    'detail' in error &&
    typeof (error as { detail?: unknown }).detail === 'object' &&
    (error as { detail?: unknown }).detail !== null
  );
}

/** 업로드 용량 초과 안내 문구를 만든다. */
function createSubtitleUploadTooLargeMessage(file: File) {
  return `파일이 너무 큽니다. 선택한 파일: ${formatFileSize(file.size)}. 더 작은 영상 파일을 선택해 주세요.`;
}

/** byte 크기를 화면 표시용으로 줄인다. */
function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))}KB`;
  }

  return `${Math.round(size / 1024 / 1024)}MB`;
}
