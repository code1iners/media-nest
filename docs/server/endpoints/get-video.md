# `GET /video`

- method/path: `GET /video`
- source file: `apps/api/src/video/video.controller.ts`
- request query:

| field | required | value |
| --- | --- | --- |
| `url` | yes | `http`/`https` media URL |
| `filename` | no | path separator/control character 없는 파일명 |
| `resolution` | no | positive integer maximum video height |

- success response: generated `video/mp4` file attachment.
- error response:
  - invalid query: `400`
  - generation failure: `500`, `Failed generating video file`
  - file send failure: `500`, `Failed sending media file`
- 접근 조건: 인증 없음. API CORS allowlist 적용.
- side effect: 요청 단위 임시 디렉터리에 파일을 만들고 응답 후 삭제한다. `yt-dlp`와 ffmpeg를 실행한다.
- 구현 경계: `resolution`이 있으면 `bestvideo[height<=resolution]+bestaudio/best`, 없으면 `bestvideo+bestaudio/best`를 사용한다. 기존 호환 때문에 non-YouTube `http`/`https` URL도 허용한다.
- 검증: `pnpm --filter api run test`, `pnpm --filter api run test:e2e`
