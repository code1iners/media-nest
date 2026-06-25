import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { UserVisibleErrorDetail } from '../api/mytube-extract.api';
import { ErrorDetailsDisclosure } from './error-details-disclosure';

/** ErrorBoundary props. */
type ErrorBoundaryProps = {
  /** 오류 없이 렌더링할 하위 React tree. */
  children: ReactNode;
};

/** ErrorBoundary state. */
type ErrorBoundaryState = {
  /** 하위 tree에서 렌더링 오류가 발생했는지 여부. */
  hasError: boolean;
  /** 사용자에게 열람 가능한 오류 상세 정보. */
  detail?: UserVisibleErrorDetail;
};

/** React 렌더링 오류를 빈 화면 대신 fallback UI로 바꾼다. */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  /** 초기 오류 상태. */
  state: ErrorBoundaryState = {
    hasError: false,
  };

  /** 렌더링 오류 발생 시 fallback 상태로 전환한다. */
  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      detail: createRenderErrorDetail(error),
      hasError: true,
    };
  }

  /** 운영 디버깅을 위해 렌더링 오류를 console에 남긴다. */
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('MyTube Extract render failed.', {
      error,
      info,
    });
  }

  /** 현재 화면을 새로고침한다. */
  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-shell">
          <section className="workspace" aria-labelledby="error-title">
            <section className="console-panel error-fallback">
              <div className="panel-title-row panel-title-row--mint">
                <h1 id="error-title">화면을 불러오지 못했습니다</h1>
                <span className="title-dots" aria-hidden="true" />
              </div>
              <p role="alert">
                일시적인 문제가 발생했습니다. 새로고침 후 다시 시도해
                주세요.
              </p>
              <div className="error-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={this.handleReload}
                >
                  새로고침
                </button>
                <ErrorDetailsDisclosure detail={this.state.detail} />
              </div>
            </section>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

/** 렌더링 오류에서 사용자 열람용 상세 정보를 만든다. */
function createRenderErrorDetail(error: unknown): UserVisibleErrorDetail {
  if (hasUserVisibleErrorDetail(error)) {
    return error.detail;
  }

  return {
    code: 'UNEXPECTED_SCREEN_ERROR',
    guidance: '일시적인 문제가 발생했습니다.',
    location: '화면 표시',
    responseBody: error instanceof Error ? error.message : undefined,
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
