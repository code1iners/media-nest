# `GET /downloads/:jobId/file`

- method/path: `GET /downloads/:jobId/file`
- source file: `apps/api/src/downloads/downloads.controller.ts`
- request path:

| field | required | value |
| --- | --- | --- |
| `jobId` | yes | `ExtractionJob.id` |

- success response: R2 asset stream. `Content-Type`은 `audio/mpeg` 또는 `video/mp4`, `Content-Disposition`은 attachment.
- error response:
  - unknown job: `404`
  - non-completed or failed job: `404`
  - expired asset: `410`
- 접근 조건: 인증 없음. API CORS allowlist 적용. Browser client가 `Content-Disposition`, `Content-Type`을 읽을 수 있도록 expose한다.
- side effect: R2 object를 읽는다.
- 구현 경계: 새 asset은 YouTube 제목 기반 파일명을 우선 사용하고, 제목이 없으면 R2 object key 마지막 segment를 fallback으로 사용한다.
- 검증: `pnpm --filter api run test`, `pnpm --filter api run test:e2e`
