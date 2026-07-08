# `POST /subtitles/jobs`

- method/path: `POST /subtitles/jobs`
- source file: `apps/api/src/subtitles/subtitles.controller.ts`
- status: deprecated, `subtitle-legacy-multipart-upload`
- request form:

| field | required | value |
| --- | --- | --- |
| `file` | yes | `mp4`, `mov`, `webm` video file |
| `whisperModel` | no | `base_en` or `small_en`; default `base_en` |

- success response: 자막 job snapshot.
- error response:
  - missing/invalid file or model: `400`
  - too large file: `413`
- 접근 조건: 인증 없음. API CORS allowlist 적용.
- side effect: API server가 multipart body를 받아 R2 `subtitles/{jobId}/source.{ext}`에 저장하고 `SubtitleJob` row를 `queued`로 만든다.
- 구현 경계: 운영 대용량 업로드 기본 경로는 `POST /subtitles/uploads` direct upload다.
- 미구현/제거 추적: `docs/deprecated/subtitle-legacy-multipart-upload.md`
- 검증: `pnpm --filter api run test`, `pnpm --filter api run test:e2e`
