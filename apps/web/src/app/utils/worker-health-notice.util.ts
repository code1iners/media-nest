/** Worker health 안내 역할. */
type WorkerHealthNoticeRole = 'alert' | 'status';

/** Worker health 안내에 필요한 상태. */
type WorkerHealthNoticeInput = {
  /** Health 요청 실패 여부. */
  failed: boolean;
  /** 최초 health 요청 대기 여부. */
  pending: boolean;
  /** Worker 미가용 여부. */
  unavailable: boolean;
  /** Worker 미가용 시 표시할 제품별 안내 문구. */
  unavailableMessage: string;
};

/** 요청 설정 화면에 표시할 worker health 안내. */
export type WorkerHealthNotice = {
  /** 사용자에게 표시할 안내 문구. */
  message: string;
  /** 보조 기술에 전달할 안내 역할. */
  role: WorkerHealthNoticeRole;
  /** 상태 재확인 행동 노출 여부. */
  showRetry: boolean;
};

/** Worker health 상태를 요청 설정용 인라인 안내로 바꾼다. */
export function getWorkerHealthNotice(
  input: WorkerHealthNoticeInput,
): WorkerHealthNotice | null {
  if (input.unavailable) {
    return {
      message: input.unavailableMessage,
      role: 'alert',
      showRetry: true,
    };
  }

  if (input.failed) {
    return {
      message: '서버 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      role: 'alert',
      showRetry: true,
    };
  }

  if (input.pending) {
    return {
      message: '서비스 상태를 확인 중입니다.',
      role: 'status',
      showRetry: false,
    };
  }

  return null;
}
