# `GET /subtitles/jobs/:jobId/file`

- method/path: `GET /subtitles/jobs/:jobId/file`
- source file: `apps/api/src/subtitles/subtitles.controller.ts`
- request path:

| field | required | value |
| --- | --- | --- |
| `jobId` | yes | `SubtitleJob.id` |

- success response: generated English SRT stream. `Content-Type` is `application/x-subrip; charset=utf-8`; `Content-Disposition` is attachment.
- error response:
  - unknown job: `404`
  - non-completed or failed job: `404`
  - expired SRT: `410`
- 접근 조건: 인증 없음. API CORS allowlist 적용. Browser client가 `Content-Disposition`, `Content-Type`을 읽을 수 있도록 expose한다.
- side effect: R2 result object를 읽는다.
- 구현 경계: worker가 ffmpeg로 mono 16kHz wav를 만들고 local `whisper.cpp` CLI로 English SRT를 생성한 뒤 R2 `subtitles/{jobId}/english.srt`에 저장한다.
- 미구현 과제: `docs/unimplemented/current-unimplemented.md`
- 검증: `pnpm --filter api run test`, `pnpm --filter api run test:e2e`
