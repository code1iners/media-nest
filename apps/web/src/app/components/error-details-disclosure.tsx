import { useId, useState } from 'react';
import type { UserVisibleErrorDetail } from '../../api/mytube-extract.api';

/** 상세 원인 Disclosure props. */
type ErrorDetailsDisclosureProps = {
  /** 사용자에게 열람 가능한 오류 상세 정보. */
  detail?: UserVisibleErrorDetail;
};

/** 클릭하면 열리는 상세 원인 패널. */
export function ErrorDetailsDisclosure({
  detail,
}: ErrorDetailsDisclosureProps) {
  // States.

  /** 상세 원인 패널 열림 여부. */
  const [isOpen, setIsOpen] = useState(false);

  // Hooks.

  /** 상세 원인 패널 DOM id. */
  const detailId = useId();

  // Computed.

  /** 화면에 표시할 상세 원인 로그. */
  const detailText = formatErrorDetail(detail);

  // Handlers.

  /** 상세 원인 패널을 열거나 닫는다. */
  function handleToggleDetail() {
    setIsOpen((currentIsOpen) => !currentIsOpen);
  }

  /** 상세 원인 로그를 클립보드에 복사한다. */
  async function handleCopyDetail() {
    if (!navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(detailText);
  }

  return (
    <div className="error-details">
      <button
        aria-controls={detailId}
        aria-expanded={isOpen}
        className="secondary-button"
        type="button"
        onClick={handleToggleDetail}
      >
        {isOpen ? '상세 원인 숨기기' : '상세 원인 보기'}
      </button>

      {isOpen ? (
        <div
          className="error-details__panel"
          id={detailId}
          role="region"
          aria-label="상세 원인"
        >
          <pre>{detailText}</pre>
          <button
            className="secondary-button secondary-button--compact"
            type="button"
            onClick={handleCopyDetail}
          >
            원인 복사
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** 오류 상세 정보를 로그 문구로 만든다. */
function formatErrorDetail(detail?: UserVisibleErrorDetail) {
  if (!detail) {
    return [
      '오류 코드: UNKNOWN_ERROR',
      '발생 위치: 화면 표시',
      '안내: 일시적인 문제가 발생했습니다.',
    ].join('\n');
  }

  /** 표시 가능한 상세 원인 행. */
  const lines = [`오류 코드: ${detail.code}`, `발생 위치: ${detail.location}`];

  if (detail.requestPath) {
    lines.push(`요청 주소: ${detail.requestPath}`);
  }

  if (detail.responseStatus) {
    lines.push(`응답 상태: ${detail.responseStatus}`);
  }

  if (detail.responseBody) {
    lines.push(`응답 내용: ${detail.responseBody}`);
  }

  lines.push(`안내: ${detail.guidance}`);

  return lines.join('\n');
}
