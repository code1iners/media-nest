# `GET /audio/:id`

- method/path: `GET /audio/:id`
- source file: `apps/api/src/audio/audio.controller.ts`
- request path/query:

| field | required | value |
| --- | --- | --- |
| `id` | yes | 11자 YouTube video ID |
| `filename` | no | path separator/control character 없는 파일명 |
| `bitrate` | no | positive integer maximum audio bitrate |

- success response: generated `audio/mpeg` `.mp3` file attachment.
- error response:
  - invalid `id` or query: `400`
  - generation failure: `500`, `Error generating audio file`
  - file send failure: `500`, `Failed sending media file`
- 접근 조건: 인증 없음. API CORS allowlist 적용.
- side effect: `https://www.youtube.com/watch?v={id}`로 변환한 뒤 `GET /audio`와 같은 다운로드 생명주기를 탄다.
- 검증: `pnpm --filter api run test`, `pnpm --filter api run test:e2e`
