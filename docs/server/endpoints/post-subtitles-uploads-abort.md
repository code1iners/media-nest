# `POST /subtitles/uploads/abort`

- method/path: `POST /subtitles/uploads/abort`
- source file: `apps/api/src/subtitles/subtitles.controller.ts`
- request body:

| field | required | value |
| --- | --- | --- |
| `objectKey` | yes | `POST /subtitles/uploads` 응답의 object key |
| `uploadId` | yes | R2 multipart upload ID |
| `uploadToken` | yes | signed upload session token |

- success response:

```json
{
  "ok": true
}
```

- error response: invalid body/token/upload target는 `400`; R2 abort 실패는 서버 오류.
- 접근 조건: 인증 없음. API CORS allowlist 적용.
- side effect: R2 multipart upload를 abort한다.
- 검증: `pnpm --filter api run test`
