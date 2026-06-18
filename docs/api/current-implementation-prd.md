# Media Nest API 현재 구현 PRD

## 목적

Media Nest는 사용자가 YouTube 영상 URL 또는 영상 ID를 기반으로 비디오나 오디오 파일을 다운로드할 수 있게 하는 단순 미디어 변환 API 서버다.

현재 제품 범위는 웹 UI가 아니라 HTTP API 제공에 집중한다. 사용자는 브라우저, Chrome 확장 프로그램, curl 같은 HTTP 클라이언트에서 엔드포인트를 호출해 미디어 파일 다운로드 응답을 받는다. Chrome 확장 프로그램 소스는 monorepo의 `apps/chrome-extension`에 이관되어 있지만, 실제 API 호출 UI와 깨진 asset 경로 수정은 후속 작업 범위다.

## 대상 사용자

- YouTube 영상에서 비디오 파일을 내려받고 싶은 사용자
- YouTube 영상에서 오디오 파일만 추출해 내려받고 싶은 사용자
- Chrome 확장 프로그램 같은 외부 클라이언트에서 미디어 다운로드 API를 호출하려는 사용자
- 서버 상태를 단순하게 확인하려는 운영자 또는 클라이언트

## 핵심 가치

- 별도 화면 없이 URL 기반 API 호출만으로 비디오 또는 오디오 다운로드를 시작할 수 있다.
- 영상 ID만 알고 있어도 YouTube watch URL을 직접 구성하지 않고 다운로드할 수 있다.
- 비디오 해상도와 오디오 비트레이트를 쿼리 파라미터로 지정할 수 있다.
- `/health` 엔드포인트로 서버가 응답 가능한 상태인지 확인할 수 있다.

## 현재 제공 범위

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
- 다운로드 작업 큐와 진행률 조회
- 다운로드 이력 저장
- 파일 영구 저장 또는 CDN 제공
- 브라우저 기반 관리 UI
- 상세한 에러 코드 체계
- 클라이언트별 CORS 정책 강제

## 보류된 개선 범위

- Chrome 확장 프로그램에서 이 서버를 호출할 때 CORS 오류가 발생해 현재 CORS는 전체 허용 상태로 둔다.
- CORS allowlist 강제는 확장 프로그램 origin 검증 방식을 별도로 확정한 뒤 진행한다.
- YouTube-only source policy 강제와 reverse proxy rate limit은 공개 운영 정책이 확정된 뒤 별도 개선으로 진행한다.
