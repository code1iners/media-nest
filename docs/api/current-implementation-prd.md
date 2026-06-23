# MyTube Extract API 현재 구현 PRD

## 목적

MyTube Extract는 사용자가 YouTube 영상 URL 또는 영상 ID를 기반으로 비디오나 오디오 파일을 다운로드할 수 있게 하는 단순 미디어 변환 API 서버다.

현재 제품 범위는 HTTP API 제공과 웹 앱의 URL 기반 다운로드 흐름에 집중한다. 사용자는 웹 앱, 브라우저, Chrome 확장 프로그램, curl 같은 HTTP 클라이언트에서 엔드포인트를 호출해 미디어 파일 다운로드 응답을 받는다. 웹 앱은 `/downloads` job API를 사용하고, Chrome 확장 프로그램 MVP는 기존 `/audio`, `/video` 직접 다운로드 API 계약을 소비한다.

## 대상 사용자

- YouTube 영상에서 비디오 파일을 내려받고 싶은 사용자
- YouTube 영상에서 오디오 파일만 추출해 내려받고 싶은 사용자
- Chrome 확장 프로그램 같은 외부 클라이언트에서 미디어 다운로드 API를 호출하려는 사용자
- 서버 상태를 단순하게 확인하려는 운영자 또는 클라이언트

## 핵심 가치

- 별도 화면 없이 URL 기반 API 호출만으로 비디오 또는 오디오 다운로드를 시작할 수 있다.
- 웹 앱에서는 다운로드 job 생성, 상태 조회, 취소, ready 파일 다운로드를 분리해 긴 작업 상태를 확인할 수 있다.
- 영상 ID만 알고 있어도 YouTube watch URL을 직접 구성하지 않고 다운로드할 수 있다.
- 비디오 해상도와 오디오 비트레이트를 쿼리 파라미터로 지정할 수 있다.
- `/health` 엔드포인트로 서버가 응답 가능한 상태인지 확인할 수 있다.

## 현재 제공 범위

### Downloads

Downloads 도메인은 URL 기반 오디오/비디오 다운로드를 in-memory job으로 생성하고 상태 조회, 취소, ready 파일 다운로드를 제공한다.

- `POST /downloads`: `type`, `url`, `filename`, `quality` body를 받아 다운로드 job을 만든다.
- `GET /downloads/:jobId`: job 상태를 조회한다.
- `GET /downloads/:jobId/file`: `ready` job의 파일을 attachment로 다운로드한다.
- `DELETE /downloads/:jobId`: 대기 또는 실행 중인 job을 취소한다.
- 상태는 `queued`, `running`, `ready`, `failed`, `canceled`, `expired`를 사용한다.
- `quality`는 `type=audio`일 때 최대 비트레이트, `type=video`일 때 최대 해상도로 해석한다.

현재 한계와 주의사항:

- job queue는 단일 API 프로세스의 메모리에만 저장된다.
- 서버 재시작 후 job 복구와 사용자별 작업 이력은 제공하지 않는다.
- 진행률 퍼센트는 제공하지 않고 상태 중심으로 표시한다.
- `MEDIA_DOWNLOAD_QUEUE_LIMIT`를 설정하면 대기열 길이를 제한할 수 있고, 기본값은 20이다.
- 실패 메시지는 내부 임시 경로와 upstream 오류 원문을 숨기는 generic 메시지를 사용한다.

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

Health 도메인은 서버가 HTTP 요청에 응답 가능한지 확인하는 상태 확인 API를 제공한다.

- `GET /health`: `{ "ok": true }` 응답을 반환한다.

현재 한계와 주의사항:

- 현재 health 응답은 프로세스 응답 가능 여부만 나타낸다.
- ffmpeg, youtube-dl-exec, 파일 시스템 쓰기 권한 같은 실제 다운로드 의존성 상태는 검사하지 않는다.
- 실제 런타임 의존성 버전과 실행 가능 여부는 `pnpm --filter api run verify:runtime`으로 별도 확인한다.

## 현재 제외 범위

- 사용자 계정, 인증, 권한 관리
- Redis/BullMQ 기반 영속 다운로드 큐
- 다운로드 진행률 퍼센트 조회
- 다운로드 이력 저장
- 파일 영구 저장 또는 CDN 제공
- 브라우저 기반 관리 UI
- 상세한 에러 코드 체계

## 보류된 개선 범위

- 고정 extension ID 기반 `chrome-extension://...` origin 허용은 확장 프로그램 배포 ID가 확정된 뒤 진행한다.
- YouTube-only source policy 강제와 reverse proxy rate limit은 공개 운영 정책이 확정된 뒤 별도 개선으로 진행한다.
