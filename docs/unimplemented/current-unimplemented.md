# MyTube Extract Current Unimplemented

## 고정 extension ID 기반 CORS 허용

- 상태: 미구현
- 대상: `apps/api`, `apps/chrome-extension`
- 필요성: Chrome Web Store 배포 후 확장 프로그램이 고정 origin을 보내는 경우 API가 해당 origin을 허용해야 한다.
- 현재 상태: API CORS allowlist는 no-origin 요청, 운영 web origin `https://mytube-extract-web.codeliners.cc`, local preview/dev origin만 허용한다. 고정 extension ID를 모르는 상태라 `chrome-extension://{id}` origin은 허용하지 않는다.
- 구현 메모:
  - no-origin extension/download 요청 허용은 유지해야 한다.
  - Chrome Web Store 배포 ID가 확정되면 `chrome-extension://{id}` origin 허용 여부를 별도 테스트로 고정한다.
  - `host_permissions`는 Chrome extension client 권한이고 API CORS allowlist와 별도 책임이다.
- 관련 근거:
  - `apps/api/src/main.ts`
  - `apps/chrome-extension/wxt.config.ts`
  - `docs/plans/2026-06-22-002-fix-cors-allowlist-plan.md`

## 다운로드 도중 취소

- 상태: 미구현
- 대상: `apps/web`, `apps/chrome-extension`, `apps/api`
- 필요성: 사용자가 장시간 다운로드 준비 중인 작업을 중단할 수 있어야 한다.
- 현재 상태: API downloader는 `AbortSignal`로 child process를 종료하는 seam이 있지만, 사용자가 명시적으로 취소를 요청하는 UI/API 계약은 없다.
- 구현 메모:
  - Web 앱은 `fetch` 요청에 `AbortController`를 연결하고 다운로드 준비 중 취소 버튼을 노출한다.
  - Chrome 확장 프로그램은 `chrome.downloads.download` 시작 전 `/health` 확인과 다운로드 시작 요청의 취소 가능 범위를 분리해 정의한다.
  - API는 HTTP client abort와 명시적 cancel 요청 중 어떤 계약을 지원할지 먼저 정해야 한다.
  - 서버 생성 작업 취소는 임시 작업 디렉터리 cleanup과 child process kill이 한 번만 실행되는지 검증해야 한다.
- 관련 근거:
  - `apps/api/src/media/media-download.service.ts`
  - `apps/api/src/media/youtube-dl-media-downloader.ts`
  - `docs/plans/2026-06-18-003-refactor-media-download-architecture-plan.md`
