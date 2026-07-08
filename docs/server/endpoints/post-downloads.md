# `POST /downloads`

- method/path: `POST /downloads`
- source file: `apps/api/src/downloads/downloads.controller.ts`
- request body:

| field | required | value |
| --- | --- | --- |
| `type` | yes | `audio` or `video` |
| `url` | yes | YouTube watch, Shorts, or `youtu.be` URL |
| `quality` | no | audio `128`/`192`/`320`, video `360`/`720`/`1080`; missing or legacy `default` becomes audio `320`, video `1080` |

- success response:

```json
{
  "jobId": "uuid",
  "status": "queued",
  "displayStatus": "queued",
  "progress": 0,
  "type": "audio",
  "quality": "192",
  "createdAt": "2026-06-24T05:32:00.000Z",
  "retentionDays": 7,
  "downloadUrl": null,
  "errorCode": null,
  "message": "요청이 접수되어 대기 중입니다."
}
```

- error response: invalid `type`, `url`, or `quality` returns `400`.
- 접근 조건: 인증 없음. API CORS allowlist 적용.
- side effect: `ExtractionJob` row를 만든다. 같은 `videoId`/`type`/`quality`의 유효한 R2 asset이 있으면 새 job을 즉시 `completed`로 만든다.
- 관련 worker: `apps/worker/src/main.ts`가 queued job을 FIFO로 처리하고 R2 asset을 생성한다.
- 미구현 과제: `docs/unimplemented/current-unimplemented.md`
- 검증: `pnpm --filter api run test`, `pnpm --filter api run test:e2e`
