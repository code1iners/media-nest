# `GET /subtitles/jobs/:jobId`

- method/path: `GET /subtitles/jobs/:jobId`
- source file: `apps/api/src/subtitles/subtitles.controller.ts`
- request path:

| field | required | value |
| --- | --- | --- |
| `jobId` | yes | `SubtitleJob.id` |

- success response:

```json
{
  "jobId": "uuid",
  "status": "queued",
  "displayStatus": "queued",
  "stage": "queued",
  "progress": 10,
  "fileName": "sample-video.mp4",
  "whisperModel": "base_en",
  "createdAt": "2026-07-03T01:00:00.000Z",
  "retentionDays": 7,
  "downloadUrl": null,
  "errorCode": null,
  "message": "요청이 접수되어 대기 중입니다."
}
```

- error response: 알 수 없는 `jobId`는 `404`.
- 접근 조건: 인증 없음. API CORS allowlist 적용.
- side effect: 없음. `SubtitleJob` row를 읽는다.
- 구현 경계: 상태는 `queued`, `extracting_audio`, `transcribing`, `completed`, `failed`를 사용한다. 만료된 완료 SRT는 `displayStatus: "expired"`다.
- 검증: `pnpm --filter api run test`, `pnpm --filter api run test:e2e`
