# `POST /subtitles/uploads`

- method/path: `POST /subtitles/uploads`
- source file: `apps/api/src/subtitles/subtitles.controller.ts`
- request body:

| field | required | value |
| --- | --- | --- |
| `fileName` | yes | `mp4`, `mov`, `webm` 확장자 |
| `contentType` | yes | `video/mp4`, `video/quicktime`, `video/webm` |
| `sizeBytes` | yes | positive number, `SUBTITLE_UPLOAD_MAX_BYTES` 이하 |
| `whisperModel` | no | `base_en` or `small_en`; default `base_en` |

- success response:

```json
{
  "uploadId": "r2-upload-id",
  "uploadToken": "signed-token",
  "objectKey": "subtitles/uploads/{sessionId}/source.mp4",
  "partSizeBytes": 67108864,
  "expiresAt": "2026-07-07T07:30:00.000Z",
  "parts": [
    {
      "partNumber": 1,
      "uploadUrl": "https://..."
    }
  ]
}
```

- error response:
  - invalid body/file metadata/model: `400`
  - too large file: `413`
- 접근 조건: 인증 없음. API CORS allowlist 적용. R2 bucket CORS는 browser `PUT` preflight와 `ETag` expose가 필요하다.
- side effect: R2 multipart upload session을 만들고 part별 presigned `UploadPart` URL을 발급한다.
- 구현 경계: `uploadToken`은 file metadata, object key, upload ID, model, expiry를 HMAC으로 서명한다.
- 검증: `pnpm --filter api run test`, `pnpm --filter api run test:e2e`
