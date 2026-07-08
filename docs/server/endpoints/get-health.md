# `GET /health`

- method/path: `GET /health`
- source file: `apps/api/src/health/health.controller.ts`
- request: 없음
- success response:

```json
{
  "ok": true,
  "worker": {
    "available": true
  }
}
```

- error response: DB 조회 실패 등 서버 오류는 Nest 기본 `5xx` 응답을 반환한다.
- 접근 조건: 인증 없음. API CORS allowlist는 browser origin에만 적용된다.
- side effect: 없음. `WorkerHeartbeat.id = "default"` row의 `lastSeenAt`을 읽는다.
- 구현 경계: `WORKER_HEARTBEAT_STALE_MS` 안에 heartbeat가 있으면 `worker.available: true`다. `lastSeenAt`과 stale 기준값은 응답에 노출하지 않는다.
- 검증: `pnpm --filter api run test`, `pnpm --filter api run test:e2e`
