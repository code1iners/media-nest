import { describe, expect, it } from 'vitest';
import { getWorkerHealthNotice } from '../../src/app/utils/worker-health-notice.util';

describe('worker health notice', () => {
  it('shows a quiet status while the first health check is pending', () => {
    expect(
      getWorkerHealthNotice({
        failed: false,
        pending: true,
        unavailable: false,
        unavailableMessage: '현재 추출 서버가 준비되지 않았습니다.',
      }),
    ).toEqual({
      message: '서비스 상태를 확인 중입니다.',
      role: 'status',
      showRetry: false,
    });
  });

  it('shows retryable alerts for unavailable and failed workers', () => {
    expect(
      getWorkerHealthNotice({
        failed: false,
        pending: false,
        unavailable: true,
        unavailableMessage: '현재 추출 서버가 준비되지 않았습니다.',
      }),
    ).toMatchObject({ role: 'alert', showRetry: true });
    expect(
      getWorkerHealthNotice({
        failed: true,
        pending: false,
        unavailable: false,
        unavailableMessage: '현재 추출 서버가 준비되지 않았습니다.',
      }),
    ).toMatchObject({ role: 'alert', showRetry: true });
  });

  it('hides the notice after a successful health check', () => {
    expect(
      getWorkerHealthNotice({
        failed: false,
        pending: false,
        unavailable: false,
        unavailableMessage: '현재 추출 서버가 준비되지 않았습니다.',
      }),
    ).toBeNull();
  });
});
