# MyTube Extract

MyTube Extract는 YouTube 영상 URL 또는 영상 ID를 받아 비디오 파일이나 mp3 오디오 파일을 준비하는 NestJS API, FIFO worker, Vite web 앱, Chrome 확장 프로그램 workspace다.

## Requirements

- Node.js 22
- pnpm 11
- ffmpeg

Docker 실행 환경은 `apps/api/Dockerfile`, `apps/worker/Dockerfile`에서 아래 런타임 의존성을 고정한다.

- Node.js: `node:22.22.3-bookworm-slim`
- `youtube-dl-exec`: `pnpm-lock.yaml` 기준 `3.1.8`
- `yt-dlp`: GitHub release `2026.06.09`
- ffmpeg: Debian bookworm package `7:5.1.8-0+deb12u1`, 실행 경로 `/usr/bin/ffmpeg`
- Python: Debian bookworm `python3`, `yt-dlp` 실행용

## Environment

Docker Compose 통합 실행은 `docker-compose.env.example`을 기준으로 실행 환경 파일을 만든다.

```bash
cp docker-compose.env.example docker-compose.env
```

앱 단독 실행은 앱별 env example을 기준으로 한다.

```bash
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env
cp apps/chrome-extension/.env.example apps/chrome-extension/.env
```

주요 환경 변수:

- `PORT`: 서버 포트. 기본값은 `3030`
- `FFMPEG_LOCATION`: ffmpeg 실행 파일 경로
- `DATABASE_URL`: Prisma가 사용하는 PostgreSQL 연결 URL
- `DIRECT_URL`: Prisma migration에서 사용할 직접 PostgreSQL 연결 URL
- `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: R2 S3 compatible storage 설정
- `R2_PUBLIC_BASE_URL`: S3 API read fallback에 사용할 public object base URL
- `ASSET_RETENTION_DAYS`: 추출 asset 보관 기간. 기본값은 `7`
- `WORKER_LOOP_INTERVAL_MS`: worker idle polling 간격. 기본값은 `5000`
- `WORKER_PROCESSING_TIMEOUT_MS`: stuck processing job을 queued로 복구하는 기준. 기본값은 `3600000`
- `MEDIA_DOWNLOAD_TIMEOUT_MS`: 다운로드 생성 타임아웃. 비워두면 기존처럼 제한하지 않음
- `MEDIA_DOWNLOAD_CONCURRENCY`: 동시 다운로드 생성 제한. 비워두면 기존처럼 제한하지 않음
- `EXPECTED_NODE_MAJOR`: 런타임 검증 시 기대하는 Node.js major 버전
- `EXPECTED_YT_DLP_VERSION`: 런타임 검증 시 기대하는 yt-dlp 버전
- `EXPECTED_FFMPEG_LOCATION`: 런타임 검증 시 기대하는 ffmpeg 실행 파일 경로
- `EXPECTED_FFMPEG_VERSION`: 런타임 검증 시 기대하는 ffmpeg 버전 문자열
- `VITE_MYTUBE_EXTRACT_API_BASE_URL`: web 앱이 호출할 API base URL. 비워두면 dev는 `http://127.0.0.1:3030`, production은 `https://media-nest.codeliners.cc`
- `WXT_MYTUBE_EXTRACT_API_BASE_URL`: Chrome 확장 프로그램이 호출할 API base URL. 비워두면 `https://media-nest.codeliners.cc`

## Run With Node.js

```bash
pnpm install
pnpm --filter @mytube-extract/db run migrate:deploy
pnpm --filter api run build
pnpm --filter worker run build
pnpm --filter api run start:prod
# 별도 shell
pnpm --filter worker run start
```

개발 모드:

```bash
pnpm --filter api run start:dev
```

전체 workspace task graph를 실행할 때는 Turborepo root script를 사용한다.

```bash
pnpm turbo run build
pnpm turbo run lint
pnpm turbo run test
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

API 런타임 의존성 확인:

```bash
docker compose run --rm api pnpm --dir apps/api run verify:runtime
```

`/health`는 서버 프로세스 응답성만 확인한다. ffmpeg, `yt-dlp`, Node.js 버전 같은 미디어 처리 의존성은 `pnpm --dir apps/api run verify:runtime`으로 확인한다.

로그 확인:

```bash
docker compose logs -f --tail=100 api
docker compose logs -f --tail=100 worker
```

재시작/종료:

```bash
docker compose restart api worker
docker compose down
```

## Update / Deploy

```bash
git pull --ff-only
pnpm --filter @mytube-extract/db run migrate:deploy
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3030/health
```

런타임 의존성 검증:

```bash
docker compose run --rm api pnpm --dir apps/api run verify:runtime
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

자세한 API 제품 범위와 기능 계약은 `docs/api/current-implementation-prd.md`, `docs/api/current-implementation-fsd.md`를 기준으로 한다. Web 앱 계약은 `docs/web/current-implementation-prd.md`, `docs/web/current-implementation-fsd.md`를 기준으로 한다.

웹 앱용 job 기반 다운로드:

```text
POST /downloads
GET /downloads/{JOB_ID}
GET /downloads/{JOB_ID}/file
```

`POST /downloads` body:

```json
{
  "type": "audio",
  "url": "https://www.youtube.com/watch?v=...",
  "quality": "192"
}
```

응답은 `jobId`, `status`, `displayStatus`, `progress`, `downloadUrl`, `errorCode`, `message`를 반환한다. 상태는 `queued`, `processing`, `completed`, `failed`를 사용하며, 만료된 완료 asset은 `displayStatus: "expired"`로 표시한다. `downloadUrl`이 있으면 `GET /downloads/{JOB_ID}/file`로 attachment를 받을 수 있다.

호환용 직접 비디오 다운로드:

```text
GET /video?url={MEDIA_URL}
GET /video/{YOUTUBE_VIDEO_ID}
GET /video/{YOUTUBE_VIDEO_ID}?filename=sample&resolution=720
```

호환용 직접 오디오 다운로드:

```text
GET /audio?url={MEDIA_URL}
GET /audio/{YOUTUBE_VIDEO_ID}
GET /audio/{YOUTUBE_VIDEO_ID}?filename=sample&bitrate=320
```

입력값 검증:

- `/downloads`의 `url`은 지원하는 YouTube watch, Shorts, `youtu.be` URL이어야 한다.
- `id`는 11자 YouTube 영상 ID 형식이어야 한다.
- `resolution`과 `bitrate`는 양의 정수여야 한다.
- `filename`에는 경로 구분자나 제어 문자를 넣을 수 없다.
- `/downloads`의 `quality`는 `default`, audio `128`/`192`/`320`, video `360`/`720`/`1080`만 허용한다.

다운로드 처리:

- 요청 검증, 다운로드 생성, HTTP 파일 전송은 분리된 경계에서 처리한다.
- `youtube-dl-exec` 실행은 adapter 뒤에 격리되어 있고, 서비스는 오디오/비디오 포맷 선택만 담당한다.
- 다운로드 실패와 파일 전송 실패 응답은 내부 임시 경로 또는 upstream 오류 원문을 노출하지 않는 메시지를 사용한다. YouTube bot/auth 감지 실패는 인증 확인 필요 메시지로 구분한다.
- `/downloads`는 PostgreSQL job table, worker FIFO polling, R2 asset 저장소를 사용한다.
- 완료 asset은 보관 기간이 지나면 scheduler가 R2 object와 DB row를 정리한다.

## CORS

API CORS는 현재 호출 표면 기준 allowlist를 사용한다.

- `Origin`이 없는 요청은 허용한다.
- 운영 web origin `https://mytube-extract.codeliners.cc`는 허용한다.
- 이전 운영 web origin `https://mytube-extract-web.codeliners.cc`도 전환 기간 호환을 위해 허용한다.
- `NODE_ENV`가 production이 아니면 local preview/dev origin `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:5173`, `http://127.0.0.1:5173`을 허용한다.
- 그 외 browser origin은 CORS 응답 header를 받지 못한다.
- `Content-Disposition`, `Content-Type`은 browser client가 읽을 수 있도록 expose한다.

Chrome extension ID를 모르는 상태이므로 `EXTENSION_ID` 기반 `chrome-extension://...` origin 허용은 현재 범위에서 제외한다.

## Chrome Extension

Chrome 확장 프로그램 소스는 `apps/chrome-extension` workspace package에서 관리한다.

Chrome 확장 프로그램의 제품 범위와 기능 계약은 `docs/chrome-extension/current-implementation-prd.md`, `docs/chrome-extension/current-implementation-fsd.md`를 기준으로 한다.

현재 MVP는 WXT + React + TypeScript popup에서 사용자가 입력하거나 현재 탭에서 가져온 YouTube URL, 다운로드 형식, 선택 옵션을 조합해 MyTube Extract API의 `/audio?url=...` 또는 `/video?url=...` 다운로드를 시작한다. Web 앱은 같은 API의 `/downloads` job 생성, 상태 polling, 완료 파일 다운로드 흐름을 사용한다.

로컬 개발 서버:

```bash
pnpm dev
```

`pnpm dev`는 API watch server, worker, web Vite dev server, WXT extension dev mode를 함께 실행한다. Extension dev task는 API `http://127.0.0.1:3030/health`와 WXT dev output `apps/chrome-extension/.output/chrome-mv3-dev/manifest.json` 준비 상태를 확인하고, 같은 API 주소를 `WXT_MYTUBE_EXTRACT_API_BASE_URL`로 popup build에 전달한다. 준비되면 개발용 popup preview를 자동으로 연다.

개발 중 바로 보는 UI는 wrapper가 여는 popup preview server다. Preview에서도 사용자가 원본 URL을 직접 입력해 상태와 레이아웃을 확인한다.

```text
http://localhost:3000/popup.html
```

확장 프로그램 API 주소는 WXT runtime 환경 변수로 정한다.

```bash
WXT_MYTUBE_EXTRACT_API_BASE_URL=http://127.0.0.1:3030 pnpm --filter chrome-extension run dev
WXT_MYTUBE_EXTRACT_API_BASE_URL=https://media-nest.codeliners.cc pnpm --filter chrome-extension run build
```

자동 open을 끄려면 아래처럼 실행한다.

```bash
MYTUBE_EXTRACT_DEV_OPEN_PREVIEW=0 pnpm dev
```

3000 port가 이미 사용 중이면 다른 preview port를 지정한다.

```bash
MYTUBE_EXTRACT_PREVIEW_PORT=3002 pnpm dev
```

개발 서버가 켜진 상태에서 popup이 실제로 load unpacked로 뜨는지 빠르게 확인:

```bash
pnpm dev:smoke
```

WXT dev mode는 extension을 설치한 Chromium을 열어 실제 popup도 확인할 수 있게 한다. 개발 중 바로 보는 화면은 localhost popup preview이고, 실제 extension runtime 확인은 WXT가 연 Chromium에서 extension popup을 열어 확인한다. 개발 중 빠른 smoke는 dev output인 `apps/chrome-extension/.output/chrome-mv3-dev`를 사용하고, 실제 production load unpacked 검증은 production build output인 `apps/chrome-extension/.output/chrome-mv3`를 사용한다.

확장 프로그램 build output, URL 생성 로직, TypeScript 구조 확인:

```bash
pnpm --filter chrome-extension run build
pnpm --filter chrome-extension run test
pnpm --filter chrome-extension run lint
```

브라우저 smoke:

```bash
pnpm --filter chrome-extension run test:browser
```

`test:browser`는 먼저 API `/health`를 확인하고, WXT production build를 Chromium load unpacked로 렌더링한 뒤, built popup을 브라우저에서 실행해 URL 미입력, 현재 탭 URL 가져오기, 서버 확인 실패, 다운로드 시작 흐름을 검증한다. `dev:smoke`는 이미 실행 중인 WXT dev output으로 popup 렌더링만 빠르게 확인하며 production build를 만들지 않는다. Chrome Web Store 배포, 고정 extension ID 기반 CORS 허용, 다운로드 진행률 표시는 후속 범위다.

## Test

```bash
pnpm turbo run test
pnpm --filter api run test:e2e
pnpm turbo run build
pnpm turbo run lint
pnpm --filter api run verify:runtime
```
