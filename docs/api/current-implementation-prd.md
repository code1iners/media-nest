# MyTube Extract API 현재 구현 PRD

## 목적

MyTube Extract는 사용자가 YouTube 영상 URL 또는 영상 ID를 기반으로 비디오나 오디오 파일을 다운로드하거나, 로컬 영상에서 영어 SRT를 생성할 수 있게 하는 단순 미디어 변환 API 서버다.

현재 제품 범위는 HTTP API 제공과 웹 앱의 URL 기반 다운로드 흐름에 집중한다. 사용자는 웹 앱, 브라우저, Chrome 확장 프로그램, curl 같은 HTTP 클라이언트에서 엔드포인트를 호출해 미디어 파일 다운로드 응답을 받는다. 웹 앱은 `/downloads` job API를 사용하고, Chrome 확장 프로그램 MVP는 기존 `/audio`, `/video` 직접 다운로드 API 계약을 소비한다. Web 앱 화면 계약은 `docs/web/current-implementation-prd.md`를 기준으로 한다.

## 대상 사용자

- YouTube 영상에서 비디오 파일을 내려받고 싶은 사용자
- YouTube 영상에서 오디오 파일만 추출해 내려받고 싶은 사용자
- 로컬 영상에서 영어 SRT 자막 파일을 생성하고 싶은 사용자
- Chrome 확장 프로그램 같은 외부 클라이언트에서 미디어 다운로드 API를 호출하려는 사용자
- 서버와 worker 처리 가능 상태를 확인하려는 운영자 또는 클라이언트

## 핵심 가치

- 별도 화면 없이 URL 기반 API 호출만으로 비디오 또는 오디오 다운로드를 시작할 수 있다.
- 웹 앱에서는 다운로드 job 생성, 상태 조회, 완료 파일 다운로드를 분리해 긴 작업 상태를 확인할 수 있다.
- 영상 ID만 알고 있어도 YouTube watch URL을 직접 구성하지 않고 다운로드할 수 있다.
- 비디오 해상도와 오디오 비트레이트를 쿼리 파라미터로 지정할 수 있다.
- `/health` 엔드포인트로 서버 응답 가능 여부와 worker 처리 가능 여부를 확인할 수 있다.

### Subtitles

Subtitles 도메인은 로컬 영상 파일을 R2 direct multipart upload로 받은 뒤 PostgreSQL job으로 생성하고, worker가 영어 SRT를 만든 뒤 R2 asset 기반 파일 다운로드를 제공한다.

- `POST /subtitles/uploads`: `fileName`, `contentType`, `sizeBytes`, `whisperModel` metadata를 받고 R2 multipart presigned URL 목록을 만든다.
- `POST /subtitles/uploads/complete`: 브라우저가 R2로 직접 올린 part `ETag` 목록을 받아 multipart upload를 완료하고 자막 job을 만든다.
- `POST /subtitles/uploads/abort`: 실패하거나 취소한 R2 multipart upload를 정리한다.
- `POST /subtitles/jobs`: 기존 `multipart/form-data` 업로드 호환 endpoint다. `subtitle-legacy-multipart-upload`로 deprecated 처리되어 안정화 후 제거한다.
- `GET /subtitles/jobs/:jobId`: job 상태를 조회한다.
- `GET /subtitles/jobs/:jobId/file`: `completed` job의 영어 SRT를 attachment로 다운로드한다.
- DB 상태는 `queued`, `extracting_audio`, `transcribing`, `completed`, `failed`를 사용하고, 만료된 완료 SRT는 `displayStatus: "expired"`로 표시한다.

현재 한계와 주의사항:

- CTA 1 범위는 영어 SRT 생성만 포함하며 한글 번역은 제공하지 않는다.
- `base_en`은 빠른 생성, `small_en`은 더 느리지만 정확도 우선 선택지로 제공한다.
- 운영 대용량 업로드는 Cloudflare request body 제한을 피하기 위해 API 서버가 파일 body를 받지 않는 R2 direct upload를 기본 흐름으로 사용한다.
- worker는 ffmpeg로 mono 16kHz wav를 추출한 뒤 local `whisper.cpp` CLI에 `language=en`, SRT 출력 옵션으로 요청한다.
- 긴 영상 chunking은 제공하지 않으며 추출된 audio가 local Whisper 처리 보호용 `SUBTITLE_AUDIO_MAX_BYTES`를 넘으면 실패 처리한다.
- 실패 메시지는 내부 임시 경로, whisper.cpp 실행 오류, R2 credential을 사용자에게 노출하지 않는다.

## 현재 제공 범위

### Downloads

Downloads 도메인은 URL 기반 오디오/비디오 다운로드를 PostgreSQL job으로 생성하고 상태 조회, R2 asset 기반 파일 다운로드를 제공한다.

- `POST /downloads`: `type`, `url`, `quality` body를 받아 다운로드 job을 만든다.
- `GET /downloads/:jobId`: job 상태를 조회한다.
- `GET /downloads/:jobId/file`: `completed` job의 R2 asset을 attachment로 다운로드한다.
- 새로 추출된 완료 파일은 가능한 경우 실제 YouTube 영상 제목을 기본 다운로드 파일명으로 사용한다.
- DB 상태는 `queued`, `processing`, `completed`, `failed`를 사용하고, 만료된 완료 asset은 `displayStatus: "expired"`로 표시한다.
- `quality`는 audio `128`/`192`/`320`, video `360`/`720`/`1080`만 허용한다. 입력이 없거나 legacy `default`면 audio는 `320`, video는 `1080`으로 정규화한다.

현재 한계와 주의사항:

- worker는 한 번에 하나의 queued job을 FIFO로 처리한다.
- 서버 재시작 후에도 job row는 남지만 사용자별 작업 이력 UI는 제공하지 않는다.
- 진행률은 상태 기반 `0`, `50`, `100` 값만 제공한다.
- 실패 메시지는 내부 임시 경로와 upstream 오류 원문을 숨기되, 큰 영상, YouTube 인증 필요, format 선택 실패, 업로드 실패는 사용자용 메시지로 구분한다.

### Video

Video 도메인은 YouTube 원본 URL 또는 영상 ID를 입력받아 비디오 파일 다운로드 응답을 제공한다.

- `GET /video`: `url` 쿼리로 전달된 미디어 URL을 다운로드한다.
- `GET /video/:id`: YouTube 영상 ID를 받아 `https://www.youtube.com/watch?v={id}` 형식으로 다운로드한다.
- `filename` 쿼리로 다운로드 파일명을 지정할 수 있다.
- `resolution` 쿼리로 최대 영상 높이를 제한할 수 있다.

현재 한계와 주의사항:

- 지원 대상은 현재 구현상 YouTube URL 또는 YouTube 영상 ID 사용을 전제로 한다.
- `GET /video`의 non-YouTube `http/https` URL 허용은 기존 클라이언트 호환성을 위해 유지한다.
- URL, YouTube 영상 ID, 파일명, 해상도 입력은 런타임에서 기본 검증한다.
- 인증과 상세한 실패 사유 분류는 제공하지 않는다.
- `MEDIA_DOWNLOAD_TIMEOUT_MS`, `MEDIA_DOWNLOAD_CONCURRENCY`를 설정하면 다운로드 생성 timeout과 동시 실행 제한을 적용할 수 있다.
- 다운로드 파일 생성과 응답 전송은 요청 단위 서버 로컬 임시 디렉터리에 의존한다.
- client-facing 오류는 내부 임시 경로와 upstream 오류 원문을 숨기는 generic 메시지를 사용한다.

### Audio

Audio 도메인은 YouTube 원본 URL 또는 영상 ID를 입력받아 오디오 추출 다운로드 응답을 제공한다.

- `GET /audio`: `url` 쿼리로 전달된 미디어 URL에서 오디오를 추출한다.
- `GET /audio/:id`: YouTube 영상 ID를 받아 `https://www.youtube.com/watch?v={id}` 형식으로 오디오를 추출한다.
- `filename` 쿼리로 다운로드 파일명을 지정할 수 있다.
- `bitrate` 쿼리로 최대 오디오 비트레이트를 제한할 수 있다.

현재 한계와 주의사항:

- 오디오 추출은 ffmpeg 설치와 `FFMPEG_LOCATION` 환경 변수 설정에 영향을 받는다.
- Docker 실행 환경은 Node.js `22.22.3-bookworm-slim`, `yt-dlp` `2026.06.09`, Debian bookworm ffmpeg `7:5.1.8-0+deb12u1`, `python3` 기준으로 고정한다.
- `GET /audio`의 non-YouTube `http/https` URL 허용은 기존 클라이언트 호환성을 위해 유지한다.
- URL, YouTube 영상 ID, 파일명, 비트레이트 입력은 런타임에서 기본 검증한다.
- 인증과 상세한 실패 사유 분류는 제공하지 않는다.
- `MEDIA_DOWNLOAD_TIMEOUT_MS`, `MEDIA_DOWNLOAD_CONCURRENCY`를 설정하면 다운로드 생성 timeout과 동시 실행 제한을 적용할 수 있다.
- 현재 구현은 오디오 추출 포맷과 다운로드 파일명 확장자를 `.mp3`로 맞춘다.
- client-facing 오류는 내부 임시 경로와 upstream 오류 원문을 숨기는 generic 메시지를 사용한다.

### Health

Health 도메인은 서버가 HTTP 요청에 응답 가능한지와 worker가 최근 heartbeat를 보냈는지 확인하는 상태 확인 API를 제공한다.

- `GET /health`: `{ "ok": true, "worker": { "available": true } }` 응답을 반환한다.

현재 한계와 주의사항:

- `worker.available`은 DB에 저장된 단일 worker heartbeat와 `WORKER_HEARTBEAT_STALE_MS` 기준으로 계산한다.
- ffmpeg, youtube-dl-exec, 파일 시스템 쓰기 권한 같은 실제 다운로드 의존성 상태는 검사하지 않는다.
- 실제 런타임 의존성 버전과 실행 가능 여부는 `pnpm --filter api run verify:runtime`으로 별도 확인한다.

## 현재 제외 범위

- 사용자 계정, 인증, 권한 관리
- Redis/BullMQ 기반 다중 worker queue
- yt-dlp stderr 기반 세부 진행률 조회
- 다운로드 이력 저장
- 자막 번역과 자막 편집기
- 파일 영구 저장 또는 CDN 제공
- 브라우저 기반 관리자 UI
- 상세한 에러 코드 체계

## 보류된 개선 범위

- 고정 extension ID 기반 `chrome-extension://...` origin 허용은 확장 프로그램 배포 ID가 확정된 뒤 진행한다.
- YouTube-only source policy 강제와 reverse proxy rate limit은 공개 운영 정책이 확정된 뒤 별도 개선으로 진행한다.
