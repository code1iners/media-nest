# `POST /subtitles/uploads/complete`

- method/path: `POST /subtitles/uploads/complete`
- source file: `apps/api/src/subtitles/subtitles.controller.ts`
- request body:

| field | required | value |
| --- | --- | --- |
| `objectKey` | yes | `POST /subtitles/uploads` 응답의 object key |
| `uploadId` | yes | R2 multipart upload ID |
| `uploadToken` | yes | signed upload session token |
| `parts` | yes | `{ partNumber, etag }[]` |

- success response: 자막 job snapshot.
- error response:
  - invalid body/token/parts: `400`
  - R2 metadata mismatch or DB creation failure: `5xx`
- 접근 조건: 인증 없음. API CORS allowlist 적용.
- side effect: R2 multipart upload를 complete하고, `SubtitleJob` row를 `queued` 상태로 만든다. complete 뒤 metadata 검증이나 DB 생성이 실패하면 source object를 best-effort로 삭제한다.
- 구현 경계: R2 object `ContentLength`, `ContentType`이 token payload와 같아야 한다.
- 검증: `pnpm --filter api run test`, `pnpm --filter api run test:e2e`
