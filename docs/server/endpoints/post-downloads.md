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
- side effect: 입력 URL에서 검증한 `videoId`로 query-free canonical YouTube watch URL을 만들어 `ExtractionJob`에 저장한다. 같은 `videoId`/`type`/`quality`의 유효한 R2 asset이 있으면 새 job을 즉시 `completed`로 만든다.
- 관련 worker: `apps/worker/src/main.ts`가 queued job을 FIFO로 처리하고 R2 asset을 생성한다. 실제 yt-dlp extraction subprocess만 일시 실패 시 같은 work directory와 partial file을 유지한 채 한 번 더 실행한다. 인증 요구, abort/killed, process spawn, preflight, upload, DB 실패는 재시도하지 않는다.
- 운영 진단: subprocess exit code·signal·bounded stdout/stderr tail은 server-only redacted diagnostic으로만 기록하며 API response에는 노출하지 않는다.
- 미구현 과제: `docs/unimplemented/current-unimplemented.md`
- 검증: `pnpm --filter api run test`, `pnpm --filter api run test:e2e`
