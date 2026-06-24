# MyTube Extract Current Unimplemented

## 고정 extension ID 기반 CORS 허용

- 상태: 미구현
- 대상: `apps/api`, `apps/chrome-extension`
- 필요성: Chrome Web Store 배포 후 확장 프로그램이 고정 origin을 보내는 경우 API가 해당 origin을 허용해야 한다.
- 현재 상태: API CORS allowlist는 no-origin 요청, 운영 web origin `https://mytube-extract.codeliners.cc`, 이전 운영 web origin `https://mytube-extract-web.codeliners.cc`, local preview/dev origin만 허용한다. 고정 extension ID를 모르는 상태라 `chrome-extension://{id}` origin은 허용하지 않는다.
- 구현 메모:
  - no-origin extension/download 요청 허용은 유지해야 한다.
  - Chrome Web Store 배포 ID가 확정되면 `chrome-extension://{id}` origin 허용 여부를 별도 테스트로 고정한다.
  - `host_permissions`는 Chrome extension client 권한이고 API CORS allowlist와 별도 책임이다.
- 관련 근거:
  - `apps/api/src/main.ts`
  - `apps/chrome-extension/wxt.config.ts`
  - `docs/plans/2026-06-22-002-fix-cors-allowlist-plan.md`

## Chrome 확장 프로그램 job 기반 다운로드 전환

- 상태: 미구현
- 대상: `apps/chrome-extension`, `apps/api`
- 필요성: 확장 프로그램에서도 장시간 다운로드 준비 상태를 명확히 보여줄 수 있어야 한다.
- 현재 상태: 웹 앱과 API는 `/downloads` job 생성, 상태 조회, completed file 다운로드를 지원한다. Chrome 확장 프로그램은 호환용 `/audio`, `/video` 직접 다운로드 API를 계속 사용한다.
- 구현 메모:
  - Chrome 확장 프로그램은 `POST /downloads`, polling, completed file URL을 `chrome.downloads.download`로 넘기는 흐름으로 전환한다.
  - 기존 `/audio`, `/video` 직접 다운로드 API는 외부 호환성을 위해 유지한다.
- 관련 근거:
  - `apps/api/src/downloads/downloads.controller.ts`
  - `apps/web/src/domain/download-request/download-request.ts`

## 다중 worker 큐와 세부 진행률 표시

- 상태: 미구현
- 대상: `apps/api`, `apps/web`, `apps/chrome-extension`
- 필요성: 다중 worker 처리량, 긴 변환 작업의 세부 진행률이 필요해질 수 있다.
- 현재 상태: `/downloads`는 PostgreSQL job table과 단일 worker FIFO polling을 사용하며 DB 상태는 `queued`, `processing`, `completed`, `failed`까지만 제공한다. 만료된 완료 asset은 API 응답의 `displayStatus: "expired"`로 표시한다.
- 구현 메모:
  - 다중 worker throughput이 필요해지면 Redis/BullMQ 또는 DB row locking 기반 claim 전략을 검토한다.
  - 진행률 퍼센트는 `yt-dlp` stderr 파싱 안정성 검증 후 별도 도입한다.
  - 사용자별 작업 이력, quota, retry 정책은 인증/계정 범위와 함께 정의한다.
- 관련 근거:
  - `apps/worker/src/main.ts`
  - `apps/api/src/downloads/downloads.service.ts`
