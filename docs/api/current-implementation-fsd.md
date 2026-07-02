# MyTube Extract API 현재 구현 FSD

## 문서 기준

이 문서는 현재 코드 기준으로 제공되는 API 계약을 도메인과 엔드포인트별로 정리한다. 내부 구현 파일을 모두 추적하는 설계 문서가 아니라, API 호출자가 확인해야 하는 요청 파라미터, 응답 방식, 현재 한계와 주의사항을 중심으로 한다.

## 공통 실행 환경

- Runtime: NestJS 11, `apps/api/Dockerfile` 기준 Node.js `22.22.3-bookworm-slim`
- Media 처리: `youtube-dl-exec` `3.1.8`, `yt-dlp` `2026.06.09`
- 오디오/비디오 병합 및 추출 의존성: Debian bookworm ffmpeg `7:5.1.8-0+deb12u1`
- `yt-dlp` 실행 의존성: Debian bookworm `python3`
- 기본 포트: `PORT` 환경 변수가 없으면 `3030`
- 환경 파일: `.env.{NODE_ENV}` 형식으로 로드
- 주요 환경 변수:
  - `FFMPEG_LOCATION`: youtube-dl-exec 실행 시 ffmpeg 위치로 전달
  - `DATABASE_URL`, `DIRECT_URL`: Prisma PostgreSQL 연결과 migration에 사용
  - `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`: R2 S3 compatible storage와 public read fallback에 사용
  - `ASSET_RETENTION_DAYS`: 완료 asset 보관 기간. 설정하지 않으면 기본 7일
  - `WORKER_HEARTBEAT_STALE_MS`: API가 worker heartbeat를 사용 가능 상태로 인정하는 시간
  - `WORKER_LOOP_INTERVAL_MS`, `WORKER_PROCESSING_TIMEOUT_MS`: worker polling과 stuck processing job 복구 기준
  - `MEDIA_DOWNLOAD_TIMEOUT_MS`: 호환용 직접 다운로드 생성 작업에 timeout 적용
  - `MEDIA_DOWNLOAD_CONCURRENCY`: 호환용 직접 다운로드 동시 생성 수 제한
  - `EXPECTED_NODE_MAJOR`, `EXPECTED_YT_DLP_VERSION`, `EXPECTED_FFMPEG_LOCATION`, `EXPECTED_FFMPEG_VERSION`: `pnpm --filter api run verify:runtime` 실행 시 런타임 의존성 기대값으로 사용
- API 단독 실행 환경 변수 예시는 `apps/api/.env.example`에 둔다.
- Docker Compose 통합 실행 환경 변수 예시는 `docker-compose.env.example`에 둔다.
- `apps/api/.env`, `docker-compose.env`는 로컬 실행 파일로 취급하고 저장소 추적 대상에서 제외한다.
- 앱별 Dockerfile은 Node base image, `yt-dlp` release API URL, ffmpeg apt package version을 명시해 컨테이너 런타임 변동성을 줄인다.
- 저장소는 pnpm workspace와 Turborepo 기반 monorepo이며, NestJS API 서버는 `apps/api` 패키지가 소유한다.
- Web 앱은 `apps/web` 패키지가 소유하며, Vite + React 화면에서 `/downloads` job API를 소비한다. Web 앱의 현재 구조와 검증 기준은 `docs/web/current-implementation-fsd.md`를 기준으로 한다.
- Chrome 확장 프로그램은 `apps/chrome-extension` 패키지가 소유하며, WXT + React popup에서 이 API 계약을 소비한다. 확장 프로그램의 현재 구조와 검증 기준은 `docs/chrome-extension/current-implementation-fsd.md`를 기준으로 한다.

## Downloads

### `POST /downloads`

URL 기반 다운로드 job을 생성하고 파일 대신 job 상태를 반환한다.

요청:

| 항목      | 위치 | 필수   | 설명                                                         |
| --------- | ---- | ------ | ------------------------------------------------------------ |
| `type`    | body | 예     | `audio` 또는 `video`                                         |
| `url`     | body | 예     | 지원하는 YouTube watch, Shorts, `youtu.be` URL               |
| `quality` | body | 아니오 | audio `128`/`192`/`320`, video `360`/`720`/`1080`. 누락 또는 legacy `default`는 audio `320`, video `1080`으로 정규화 |

응답:

```json
{
  "jobId": "uuid",
  "status": "queued",
  "displayStatus": "queued",
  "progress": 0,
  "type": "audio",
  "quality": "192",
  "createdAt": "2026-06-24T05:32:00.000Z",
  "retentionDays": 7,
  "downloadUrl": null,
  "errorCode": null,
  "message": "요청이 접수되어 대기 중입니다."
}
```

현재 처리 방식:

- job DB 상태는 `queued`, `processing`, `completed`, `failed`를 사용한다.
- 화면 표시 상태는 `displayStatus`로 제공하며, 완료 asset이 없거나 만료되면 `expired`를 반환한다.
- 같은 `videoId`, `type`, `quality`의 유효한 R2 asset이 있으면 새 job을 즉시 `completed`로 생성한다.
- 유효한 asset이 없으면 job을 `queued`로 저장하고 worker가 FIFO로 처리한다.
- 응답에는 임시 파일 경로나 R2 credential을 포함하지 않는다.
- 실패 응답의 `message`는 `VIDEO_TOO_LARGE`, `YOUTUBE_AUTH_REQUIRED`, `YOUTUBE_FORMAT_UNAVAILABLE`, `UPLOAD_FAILED`를 사용자용 문구로 구분한다.

### `GET /downloads/:jobId`

job 상태를 조회한다.

응답:

- 존재하는 job이면 `200`과 상태 snapshot을 반환한다.
- 알 수 없는 `jobId`는 `404`를 반환한다.

### `GET /downloads/:jobId/file`

`completed` job의 R2 asset을 attachment stream으로 내려준다.

응답:

- `completed`: `audio/mpeg` 또는 `video/mp4` `Content-Type`, `Content-Disposition` attachment 응답
- `queued`, `processing`, `failed`: `404`
- `expired`: `410`
- 알 수 없는 `jobId`: `404`

현재 처리 방식:

- 새로 추출된 asset은 worker가 `yt-dlp`에서 읽은 원본 영상 제목을 `ExtractedAsset.title`에 저장한다.
- 파일명은 `ExtractedAsset.title`이 있으면 제목을 안전한 파일명으로 정리한 뒤 형식에 맞는 `.mp3` 또는 `.mp4` 확장자를 붙인다.
- `ExtractedAsset.title`이 없으면 기존 asset 호환을 위해 R2 object key 마지막 segment에서 파일명을 만든다.
- R2 S3 API read가 object mismatch로 실패하면 `R2_PUBLIC_BASE_URL` 기반 public object read를 fallback으로 시도한다.

현재 한계와 주의사항:

- worker는 한 번에 하나의 queued job만 processing으로 claim한다.
- worker는 비디오 다운로드 전 yt-dlp metadata로 선택 format과 예상 크기를 확인하고, 1GiB를 넘는 선택 결과는 `VIDEO_TOO_LARGE`로 실패 처리한다.
- stuck processing job은 `WORKER_PROCESSING_TIMEOUT_MS` 이후 queued로 복구한다.
- 완료 asset은 `ASSET_RETENTION_DAYS` 후 hourly cleanup에서 R2 object와 DB row를 함께 정리한다.
- Redis/BullMQ, 사용자별 작업 이력, yt-dlp stderr 기반 세부 진행률은 현재 범위가 아니다.

## Video

### `GET /video`

전달받은 미디어 URL에서 비디오 파일을 생성하고 다운로드 응답을 반환한다.

요청:

| 항목         | 위치  | 필수   | 설명                                            |
| ------------ | ----- | ------ | ----------------------------------------------- |
| `url`        | query | 예     | 다운로드할 미디어 URL                           |
| `filename`   | query | 아니오 | 다운로드 파일명. 없으면 15자 랜덤 문자열을 사용 |
| `resolution` | query | 아니오 | 최대 영상 높이. 예: `720`                       |

응답:

- `Content-Type`: `video/mp4`
- `Content-Disposition`: attachment 다운로드
- 정상 처리 시 서버가 생성한 비디오 파일을 응답 본문으로 전송
- 검증 실패 시 `400` 상태를 반환함
- 다운로드 생성 실패 시 `500` 상태와 `Failed generating video file`을 반환함
- 파일 전송 실패 시 `500` 상태와 `Failed sending media file`을 반환할 수 있음

현재 처리 방식:

- `resolution`이 있으면 `bestvideo[height<=resolution]+bestaudio/best` 포맷을 사용한다.
- `resolution`이 없으면 `bestvideo+bestaudio/best` 포맷을 사용한다.
- 요청마다 OS 임시 디렉터리 아래 별도 작업 디렉터리를 만들고, 응답 전송 후 해당 요청의 작업 디렉터리만 삭제한다.

현재 한계와 주의사항:

- `url`은 런타임에서 http/https URL인지 검증한다.
- non-YouTube `http/https` URL은 기존 클라이언트 호환성을 위해 현재 허용한다.
- `resolution`은 양의 정수인지 검증한다.
- `filename`은 빈 값, 경로 구분자, 제어 문자를 거부한다.
- `filename`은 응답 파일명에 `.mp4` 확장자를 붙이고, 임시 저장 경로에서는 URL 인코딩된 파일명을 사용한다.
- youtube-dl-exec에는 `mergeOutputFormat: 'mp4'`를 전달한다.
- 요청별 임시 디렉터리를 사용하므로 정상 경로에서는 다른 요청의 임시 파일을 삭제하지 않는다.
- 다운로드 생성 실패와 파일 전송 실패 응답에는 임시 경로, credential 포함 URL, upstream 오류 원문을 노출하지 않는다.

### `GET /video/:id`

YouTube 영상 ID를 받아 watch URL을 구성한 뒤 비디오 파일 다운로드 응답을 반환한다.

요청:

| 항목         | 위치  | 필수   | 설명                                            |
| ------------ | ----- | ------ | ----------------------------------------------- |
| `id`         | path  | 예     | YouTube 영상 ID                                 |
| `filename`   | query | 아니오 | 다운로드 파일명. 없으면 15자 랜덤 문자열을 사용 |
| `resolution` | query | 아니오 | 최대 영상 높이. 예: `720`                       |

응답:

- `GET /video`와 동일하게 비디오 파일 다운로드 응답을 반환한다.

현재 처리 방식:

- `id`를 `https://www.youtube.com/watch?v={id}` 형식의 URL로 변환한다.
- 이후 다운로드 처리는 `GET /video`와 같은 서비스 로직을 사용한다.

현재 한계와 주의사항:

- `id`는 11자 YouTube 영상 ID 형식인지 검증한다.
- YouTube가 아닌 다른 서비스 ID 입력은 지원하지 않는다.
- 파일명 인코딩 처리는 `GET /video`와 동일하다.

## Audio

### `GET /audio`

전달받은 미디어 URL에서 오디오를 추출하고 다운로드 응답을 반환한다.

요청:

| 항목       | 위치  | 필수   | 설명                                            |
| ---------- | ----- | ------ | ----------------------------------------------- |
| `url`      | query | 예     | 오디오를 추출할 미디어 URL                      |
| `filename` | query | 아니오 | 다운로드 파일명. 없으면 15자 랜덤 문자열을 사용 |
| `bitrate`  | query | 아니오 | 최대 오디오 비트레이트. 예: `320`               |

응답:

- `Content-Type`: `audio/mpeg`
- `Content-Disposition`: attachment 다운로드
- 정상 처리 시 서버가 생성한 오디오 파일을 응답 본문으로 전송
- 검증 실패 시 `400` 상태를 반환함
- 다운로드 생성 실패 시 `500` 상태와 `Error generating audio file`을 반환함
- 파일 전송 실패 시 `500` 상태와 `Failed sending media file`을 반환할 수 있음

현재 처리 방식:

- `bitrate`가 있으면 `bestaudio[abr<=bitrate]/best` 포맷을 사용한다.
- `bitrate`가 없으면 `bestaudio/best` 포맷을 사용한다.
- `extractAudio: true`, `audioFormat: 'mp3'` 옵션을 youtube-dl-exec에 전달한다.
- 요청마다 OS 임시 디렉터리 아래 별도 작업 디렉터리를 만들고, 응답 전송 후 해당 요청의 작업 디렉터리만 삭제한다.

현재 한계와 주의사항:

- `url`은 런타임에서 http/https URL인지 검증한다.
- non-YouTube `http/https` URL은 기존 클라이언트 호환성을 위해 현재 허용한다.
- `bitrate`는 양의 정수인지 검증한다.
- `filename`은 빈 값, 경로 구분자, 제어 문자를 거부한다.
- 오디오 포맷은 mp3로 요청하며, 임시 파일명과 다운로드 파일명은 `.mp3` 확장자를 사용한다.
- 임시 파일 삭제는 요청별 작업 디렉터리 삭제 방식으로 처리한다.
- 실패 사유는 세분화된 에러 코드로 제공되지 않는다.
- 다운로드 생성 실패와 파일 전송 실패 응답에는 임시 경로, credential 포함 URL, upstream 오류 원문을 노출하지 않는다.

### `GET /audio/:id`

YouTube 영상 ID를 받아 watch URL을 구성한 뒤 오디오 추출 다운로드 응답을 반환한다.

요청:

| 항목       | 위치  | 필수   | 설명                                            |
| ---------- | ----- | ------ | ----------------------------------------------- |
| `id`       | path  | 예     | YouTube 영상 ID                                 |
| `filename` | query | 아니오 | 다운로드 파일명. 없으면 15자 랜덤 문자열을 사용 |
| `bitrate`  | query | 아니오 | 최대 오디오 비트레이트. 예: `320`               |

응답:

- `GET /audio`와 동일하게 오디오 파일 다운로드 응답을 반환한다.

현재 처리 방식:

- `id`를 `https://www.youtube.com/watch?v={id}` 형식의 URL로 변환한다.
- 이후 다운로드 처리는 `GET /audio`와 같은 서비스 로직을 사용한다.

현재 한계와 주의사항:

- `id`는 11자 YouTube 영상 ID 형식인지 검증한다.
- YouTube가 아닌 다른 서비스 ID 입력은 지원하지 않는다.
- 파일명 인코딩 처리와 `.mp3` 확장자 처리는 `GET /audio`와 동일하다.

## 다운로드 처리 구조

- 컨트롤러는 query/path 입력을 검증된 request object로 변환하고 HTTP 파일 전송 boundary를 호출한다.
- Audio/Video 서비스는 검증된 request object를 받아 포맷 selector, MIME type, 확장자만 결정한다.
- 공통 media lifecycle은 요청 단위 임시 디렉터리 생성, output path 계산, downloader 실행, cleanup handle 생성을 담당한다.
- Downloads service는 job row 생성/조회, reusable asset 확인, R2 attachment 응답 준비를 담당한다.
- Worker는 queued job claim, yt-dlp 실행, R2 upload, asset row upsert, completed/failed 상태 전환을 담당한다.
- Worker는 main loop와 별도 heartbeat timer로 `WorkerHeartbeat` 단일 row를 주기적으로 갱신한다.
- Worker는 R2 upload에 stream 기반 multipart upload를 사용해 큰 파일을 메모리에 통째로 올리지 않는다.
- `youtube-dl-exec`와 ffmpeg 위치 조회는 adapter 뒤에 격리한다.
- downloader 실패 진단은 server log에만 남기고 URL credential, local path, token성 query 값은 redaction 후 기록한다.
- YouTube bot/auth 감지 실패는 client에 upstream 원문 대신 인증 확인 필요 메시지로 노출한다.
- `MEDIA_DOWNLOAD_TIMEOUT_MS`와 `MEDIA_DOWNLOAD_CONCURRENCY`가 비어 있으면 기존 동작처럼 timeout과 동시 실행 제한을 적용하지 않는다.

## Health

### `GET /health`

서버 프로세스가 HTTP 요청에 응답 가능한지와 worker heartbeat가 최신인지 확인한다.

요청:

| 항목 | 위치 | 필수 | 설명               |
| ---- | ---- | ---- | ------------------ |
| 없음 | -    | -    | 별도 파라미터 없음 |

응답:

```json
{
  "ok": true,
  "worker": {
    "available": true
  }
}
```

현재 처리 방식:

- `ok`는 API 프로세스 응답 가능 여부를 나타낸다.
- `worker.available`은 `WorkerHeartbeat`의 고정 `id = "default"` row가 존재하고 `lastSeenAt`이 `WORKER_HEARTBEAT_STALE_MS` 안에 있으면 `true`다.
- worker heartbeat row가 없거나 stale 기준을 넘으면 `worker.available`은 `false`다.
- `lastSeenAt`과 stale 기준값은 client 응답에 노출하지 않는다.

현재 한계와 주의사항:

- ffmpeg 설치 여부, youtube-dl-exec 실행 가능 여부, 임시 디렉터리 쓰기 권한은 확인하지 않는다.
- 실제 다운로드 기능 전체의 정상 동작을 보장하는 readiness 체크로는 부족하다.
- Node.js, ffmpeg, yt-dlp 버전과 실행 파일 존재 여부는 별도 `pnpm --filter api run verify:runtime` 명령으로 확인한다.

## CORS

- `apps/api/src/cors-options.ts`가 API CORS origin 정책을 소유한다.
- `Origin`이 없는 요청은 허용한다.
- 운영 web origin `https://mytube-extract.codeliners.cc`는 모든 환경에서 허용한다.
- 이전 운영 web origin `https://mytube-extract-web.codeliners.cc`도 전환 기간 호환을 위해 허용한다.
- `NODE_ENV`가 production이 아니면 `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:5173`, `http://127.0.0.1:5173`을 허용한다.
- 그 외 browser origin은 CORS allow-origin header를 받지 못한다.
- `Content-Disposition`, `Content-Type`은 web 앱이 attachment 파일명을 읽을 수 있도록 expose한다.
- 고정 extension ID를 모르는 상태이므로 `chrome-extension://{id}` origin 허용은 현재 구현에 포함하지 않는다.
