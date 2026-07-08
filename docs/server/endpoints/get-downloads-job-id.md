# `GET /downloads/:jobId`

- method/path: `GET /downloads/:jobId`
- source file: `apps/api/src/downloads/downloads.controller.ts`
- request path:

| field | required | value |
| --- | --- | --- |
| `jobId` | yes | `ExtractionJob.id` |

- success response: `POST /downloads`와 같은 job snapshot.
- error response: 알 수 없는 `jobId`는 `404`.
- 접근 조건: 인증 없음. API CORS allowlist 적용.
- side effect: 없음. `ExtractionJob`과 연결된 asset 상태를 읽는다.
- 구현 경계: 완료 asset이 없거나 만료되면 `displayStatus: "expired"`를 반환한다.
- 검증: `pnpm --filter api run test`, `pnpm --filter api run test:e2e`
