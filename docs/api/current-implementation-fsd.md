# MyTube Extract API 현재 구현 FSD

## 문서 기준

이 문서는 API 서버의 현재 구조와 운영 경계를 요약한다. Endpoint별 요청/응답 상세 계약은 `docs/server/endpoints/*`를 source of truth로 둔다.

## Endpoint 계약

### Health

- `docs/server/endpoints/get-health.md`

### Downloads

- `docs/server/endpoints/post-downloads.md`
- `docs/server/endpoints/get-downloads-job-id.md`
- `docs/server/endpoints/get-downloads-job-id-file.md`

### Subtitles

- `docs/server/endpoints/post-subtitles-uploads.md`
- `docs/server/endpoints/post-subtitles-uploads-complete.md`
- `docs/server/endpoints/post-subtitles-uploads-abort.md`
- `docs/server/endpoints/post-subtitles-jobs.md`
- `docs/server/endpoints/get-subtitles-jobs-job-id.md`
- `docs/server/endpoints/get-subtitles-jobs-job-id-file.md`

### Direct Download Compatibility

- `docs/server/endpoints/get-audio.md`
- `docs/server/endpoints/get-audio-id.md`
- `docs/server/endpoints/get-video.md`
- `docs/server/endpoints/get-video-id.md`

## 공통 실행 환경

- Runtime: NestJS 11, `apps/api/Dockerfile` 기준 Node.js `22.22.3-bookworm-slim`
- Media 처리: `youtube-dl-exec` `3.1.8`, `yt-dlp` `2026.06.09`
- 오디오/비디오 병합 및 추출 의존성: Debian bookworm ffmpeg `7:5.1.8-0+deb12u1`
- `yt-dlp` 실행 의존성: Debian bookworm `python3`
- 기본 포트: `PORT` 환경 변수가 없으면 `5011`
- 환경 파일: `.env.{NODE_ENV}`, `.env` 순서로 로드
- API 단독 실행 환경 변수 예시는 `apps/api/.env.example`에 둔다.
- Docker Compose 통합 실행 환경 변수 예시는 `docker-compose.env.example`에 둔다.
- `apps/api/.env`, `docker-compose.env`는 로컬 실행 파일로 취급하고 저장소 추적 대상에서 제외한다.

## 주요 환경 변수

- `FFMPEG_LOCATION`: youtube-dl-exec 실행 시 ffmpeg 위치로 전달
- `DATABASE_URL`, `DIRECT_URL`: Prisma PostgreSQL 연결과 migration에 사용
- `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`: R2 S3 compatible storage와 public read fallback에 사용
- `ASSET_RETENTION_DAYS`: 완료 asset 보관 기간. 설정하지 않으면 기본 7일
- `WORKER_HEARTBEAT_STALE_MS`: API가 worker heartbeat를 사용 가능 상태로 인정하는 시간
- `WORKER_LOOP_INTERVAL_MS`, `WORKER_PROCESSING_TIMEOUT_MS`: worker polling과 stuck processing job 복구 기준
- `SUBTITLE_UPLOAD_MAX_BYTES`: 자막 원본 영상 업로드 최대 byte. 설정하지 않으면 500MiB
- `SUBTITLE_UPLOAD_TOKEN_SECRET`: R2 direct upload session token 서명 secret. 설정하지 않으면 `R2_SECRET_ACCESS_KEY`를 fallback으로 사용한다.
- `SUBTITLE_AUDIO_MAX_BYTES`: worker의 local Whisper 처리 보호용 추출 audio 최대 byte. 설정하지 않으면 512MiB
- `WHISPER_CLI_PATH`: worker가 실행할 `whisper.cpp` CLI binary 경로
- `WHISPER_MODEL_BASE_EN_PATH`: `base_en` 선택 시 worker가 사용할 `base.en` model 파일 경로
- `WHISPER_MODEL_SMALL_EN_PATH`: `small_en` 선택 시 worker가 사용할 `small.en` model 파일 경로
- `WHISPER_THREADS`: `whisper.cpp` 실행 thread 수. 설정하지 않으면 4
- `WHISPER_LANGUAGE`: 자막 생성 언어. CTA 1 기본값은 `en`
- `MEDIA_DOWNLOAD_TIMEOUT_MS`: 호환용 직접 다운로드 생성 작업 timeout
- `MEDIA_DOWNLOAD_CONCURRENCY`: 호환용 직접 다운로드 동시 생성 수 제한
- `EXPECTED_NODE_MAJOR`, `EXPECTED_YT_DLP_VERSION`, `EXPECTED_FFMPEG_LOCATION`, `EXPECTED_FFMPEG_VERSION`: `pnpm --filter api run verify:runtime` 실행 시 런타임 의존성 기대값

## 구현 구조

- NestJS API 서버는 `apps/api` 패키지가 소유한다.
- Web 앱은 `apps/web` 패키지가 소유하며 `/downloads`, `/subtitles/*`, `/health`를 소비한다.
- Chrome 확장 프로그램은 `apps/chrome-extension` 패키지가 소유하며 호환용 `/audio`, `/video`, `/health`를 소비한다.
- Worker는 `apps/worker` 패키지가 소유하며 queued 다운로드 job과 자막 job을 FIFO로 처리한다.
- DB schema와 Prisma client는 `packages/db`가 소유한다.

## 다운로드 처리 구조

- Controller는 query/path/body 입력을 request object 또는 service input으로 넘긴다.
- Audio/Video service는 포맷 selector, MIME type, 확장자를 결정한다.
- 공통 media lifecycle은 요청 단위 임시 디렉터리 생성, output path 계산, downloader 실행, cleanup handle 생성을 담당한다.
- Downloads service는 job row 생성/조회, reusable asset 확인, query-free canonical YouTube URL 저장, R2 attachment 응답 준비를 담당한다.
- `packages/media-downloader`는 yt-dlp 단일 subprocess 실행, exit/signal/tail diagnostic, output non-empty 검증, redaction을 공통으로 담당한다. API compatibility downloader는 이를 한 번만 호출한다.
- Worker는 queued job claim, yt-dlp 실행, R2 upload, asset row upsert, completed/failed 상태 전환을 담당한다. extraction subprocess의 일반 실패와 missing output에만 같은 work directory·partial state로 한 번 재시도한다.
- Worker는 queued subtitle job claim, ffmpeg audio 추출, local Whisper transcription, SRT upload, completed/failed 상태 전환도 담당한다.
- Worker는 main loop와 별도 heartbeat timer로 `WorkerHeartbeat` 단일 row를 주기적으로 갱신한다.
- Downloader 실패 진단은 server log와 `ExtractionJob.errorDetail`에만 남기고 URL credential, local path, token성 query 값은 redaction 후 기록한다. API client에는 기존 일반 failure message만 반환한다.

## CORS

- `apps/api/src/cors-options.ts`가 API CORS origin 정책을 소유한다.
- `Origin`이 없는 요청은 허용한다.
- 운영 web origin `https://mytube-extract.codeliners.cc`는 모든 환경에서 허용한다.
- 이전 운영 web origin `https://mytube-extract-web.codeliners.cc`도 전환 기간 호환을 위해 허용한다.
- `NODE_ENV`가 production이 아니면 `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:5010`, `http://127.0.0.1:5010`을 허용한다.
- 그 외 browser origin은 CORS allow-origin header를 받지 못한다.
- `Content-Disposition`, `Content-Type`은 browser client가 attachment 파일명을 읽을 수 있도록 expose한다.
- 고정 extension ID를 모르는 상태이므로 `chrome-extension://{id}` origin 허용은 현재 구현에 포함하지 않는다.

## 검증 기준

- `pnpm --filter api run test`
- `pnpm --filter @mytube-extract/db run build`
- `pnpm --filter api run test:e2e`
- `pnpm --filter api run verify:runtime`
- `pnpm --filter worker run test`
