# Media Nest

Media Nest는 YouTube 영상 URL 또는 영상 ID를 받아 비디오 파일이나 mp3 오디오 파일을 내려주는 NestJS API 서버다.

## Requirements

- Node.js 22
- npm
- ffmpeg

Docker 실행 환경은 `Dockerfile`에서 아래 런타임 의존성을 고정한다.

- Node.js: `node:22.22.3-bookworm-slim`
- `youtube-dl-exec`: `package-lock.json` 기준 `3.0.30`
- `yt-dlp`: GitHub release `2026.06.09`
- ffmpeg: Debian bookworm package `7:5.1.8-0+deb12u1`, 실행 경로 `/usr/bin/ffmpeg`
- Python: Debian bookworm `python3`, `yt-dlp` 실행용

## Environment

`.env.example`을 기준으로 실행 환경 파일을 만든다.

```bash
cp .env.example .env.production
# 필요한 경우 EXTENSION_ID 값을 채운다.
```

주요 환경 변수:

- `PORT`: 서버 포트. 기본값은 `3030`
- `FFMPEG_LOCATION`: ffmpeg 실행 파일 경로
- `EXTENSION_ID`: Chrome 확장 프로그램 origin 구성을 위한 값
- `MEDIA_DOWNLOAD_TIMEOUT_MS`: 다운로드 생성 타임아웃. 비워두면 기존처럼 제한하지 않음
- `MEDIA_DOWNLOAD_CONCURRENCY`: 동시 다운로드 생성 제한. 비워두면 기존처럼 제한하지 않음
- `EXPECTED_NODE_MAJOR`: 런타임 검증 시 기대하는 Node.js major 버전
- `EXPECTED_YT_DLP_VERSION`: 런타임 검증 시 기대하는 yt-dlp 버전
- `EXPECTED_FFMPEG_LOCATION`: 런타임 검증 시 기대하는 ffmpeg 실행 파일 경로
- `EXPECTED_FFMPEG_VERSION`: 런타임 검증 시 기대하는 ffmpeg 버전 문자열

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
docker compose up -d --build
```

상태 확인:

```bash
docker compose ps
curl http://127.0.0.1:3030/health
```

응답:

```json
{
  "ok": true
}
```

런타임 의존성 확인:

```bash
docker compose run --rm media-nest npm run verify:runtime
```

`/health`는 서버 프로세스 응답성만 확인한다. ffmpeg, `yt-dlp`, Node.js 버전 같은 미디어 처리 의존성은 `npm run verify:runtime`으로 확인한다.

로그 확인:

```bash
docker compose logs -f --tail=100 media-nest
```

재시작/종료:

```bash
docker compose restart media-nest
docker compose down
```

## Update / Deploy

```bash
git pull --ff-only
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3030/health
```

런타임 의존성 검증:

```bash
docker compose run --rm media-nest npm run verify:runtime
```

## Rollback / Recovery

최근 git 커밋으로 되돌려 재빌드:

```bash
git log --oneline -5
git checkout <known-good-commit>
docker compose up -d --build
curl -fsS http://127.0.0.1:3030/health
```

다시 main 최신으로 복귀:

```bash
git checkout main
git pull --ff-only
docker compose up -d --build
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

다운로드 처리:

- 요청 검증, 다운로드 생성, HTTP 파일 전송은 분리된 경계에서 처리한다.
- `youtube-dl-exec` 실행은 adapter 뒤에 격리되어 있고, 서비스는 오디오/비디오 포맷 선택만 담당한다.
- 다운로드 실패와 파일 전송 실패 응답은 내부 임시 경로 또는 upstream 오류 원문을 노출하지 않는 generic 메시지를 사용한다.
- non-YouTube `http/https` URL 허용은 현재 호환성을 위해 유지한다. YouTube-only source policy는 별도 결정 후 활성화한다.

## CORS

현재 Chrome 확장 프로그램 호출에서 CORS 오류가 발생했던 이력이 있어 CORS는 전체 허용 상태로 둔다. `EXTENSION_ID` 기반 allowlist 강제는 확장 프로그램 origin 검증 방식을 확정한 뒤 다시 적용한다.

## Test

```bash
npm test
npm run test:e2e
npm run build
npm run lint
npm run verify:runtime
```
