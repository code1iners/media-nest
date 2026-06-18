# Media Nest

Media Nest는 YouTube 영상 URL 또는 영상 ID를 받아 비디오 파일이나 mp3 오디오 파일을 내려주는 NestJS API 서버다.

## Requirements

- Node.js 22
- npm
- ffmpeg

## Environment

`.env.example`을 기준으로 실행 환경 파일을 만든다.

```bash
cp .env.example .env.production
```

주요 환경 변수:

- `PORT`: 서버 포트. 기본값은 `3030`
- `FFMPEG_LOCATION`: ffmpeg 실행 파일 경로
- `EXTENSION_ID`: Chrome 확장 프로그램 origin 구성을 위한 값

## Run With Node.js

```bash
npm install
npm run build
npm run start:prod
```

개발 모드:

```bash
npm run start:dev
```

## Run With Docker

```bash
docker build -t media-nest:latest .
docker run --env-file .env.production -d -p 3030:3030 media-nest:latest
```

상태 확인:

```bash
curl http://localhost:3030/health
```

응답:

```json
{
  "ok": true
}
```

## API

비디오 다운로드:

```text
GET /video?url={MEDIA_URL}
GET /video/{YOUTUBE_VIDEO_ID}
GET /video/{YOUTUBE_VIDEO_ID}?filename=sample&resolution=720
```

오디오 다운로드:

```text
GET /audio?url={MEDIA_URL}
GET /audio/{YOUTUBE_VIDEO_ID}
GET /audio/{YOUTUBE_VIDEO_ID}?filename=sample&bitrate=320
```

입력값 검증:

- `url`은 `http` 또는 `https` URL이어야 한다.
- `id`는 11자 YouTube 영상 ID 형식이어야 한다.
- `resolution`과 `bitrate`는 양의 정수여야 한다.
- `filename`에는 경로 구분자나 제어 문자를 넣을 수 없다.

## CORS

현재 Chrome 확장 프로그램 호출에서 CORS 오류가 발생했던 이력이 있어 CORS는 전체 허용 상태로 둔다. `EXTENSION_ID` 기반 allowlist 강제는 확장 프로그램 origin 검증 방식을 확정한 뒤 다시 적용한다.

## Test

```bash
npm test
npm run test:e2e
npm run build
npm run lint
```
