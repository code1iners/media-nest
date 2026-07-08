# Deprecated: subtitle-legacy-multipart-upload

## 범위

기존 `POST /subtitles/jobs` multipart 업로드 경로는 운영 Cloudflare request body 제한을 피할 수 없어 deprecated 처리한다. 기본 자막 업로드 흐름은 R2 direct multipart upload로 전환한다.

## 남겨둔 이유

- 로컬 개발과 기존 클라이언트 호환성을 당분간 유지한다.
- R2 direct upload가 운영에서 안정화되기 전 rollback 경로를 보존한다.
- 기존 413 사용자 안내 회귀 테스트를 유지한다.

## 제거 대상

- `apps/api/src/subtitles/subtitles.controller.ts`
  - `createSubtitleJob`
  - `@Post('jobs')` multipart handler
- `apps/api/src/subtitles/subtitles.service.ts`
  - `create`
  - `assertValidUpload`
  - legacy 업로드 용량 초과 `413` service 테스트
- `apps/api/src/subtitles/subtitles.types.ts`
  - `UploadedSubtitleFile`
- `apps/web/src/api/mytube-extract.api.ts`
  - `createSubtitleJob`
  - `SubtitleUploadTooLargeError`의 legacy `requestPath: "/subtitles/jobs"` 의존
- 테스트
  - legacy multipart form data 생성 테스트
  - legacy 413 매핑 테스트

## 제거 조건

- 운영 web이 `/subtitles/uploads`, `/subtitles/uploads/complete`, `/subtitles/uploads/abort` 흐름으로 배포되어야 한다.
- 운영 R2 CORS가 browser multipart upload에 필요한 method와 header를 허용해야 한다.
- 대용량 영상 업로드와 SRT 생성 완료가 운영 브라우저에서 검증되어야 한다.
- 더 이상 `POST /subtitles/jobs`를 호출하는 공개 클라이언트가 없어야 한다.

## 확인 방법

```bash
rg "subtitle-legacy-multipart-upload|createSubtitleJob|UploadedSubtitleFile|/subtitles/jobs" apps docs
```
