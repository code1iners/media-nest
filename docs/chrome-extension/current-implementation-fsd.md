# Media Nest Chrome Extension 현재 구현 FSD

## 문서 기준

이 문서는 Chrome 확장 프로그램이 Media Nest API 서버를 소비하는 방식과 현재 snapshot의 한계를 정리한다. API 서버 자체의 요청/응답 계약은 `docs/api/current-implementation-fsd.md`를 기준으로 하며, 여기서는 확장 프로그램의 화면, 상태, 설정, API 호출 조합을 다룬다.

## 현재 소스 상태

- 확장 프로그램 소스는 `apps/chrome-extension` workspace package가 소유한다.
- `manifest.json`은 Manifest V3 형식이고 popup entry로 `./popup/popup.html`을 사용한다.
- `manifest.json`의 content script는 현재 존재하지 않는 `index.js`를 참조한다.
- `popup/popup.html`은 `./styles/index.css`, `./scripts/popup.js`를 참조하지만, 실제 파일은 popup 폴더의 상위 `styles/`, `scripts/` 아래에 있다.
- `scripts/content.js`는 현재 페이지 title을 alert로 띄우는 snapshot 코드만 가진다.
- `scripts/popup.js`는 `Enabled` checkbox와 임의 version 표시만 처리하며, 활성 탭 URL 감지, YouTube video ID 추출, API 호출은 구현되어 있지 않다.
- `background.js`는 빈 파일이다.
- `package.json`의 build/lint/test script는 실제 bundle 생성을 하지 않고 snapshot 존재만 확인하는 수준이다.

## 목표 동작

### Popup 진입

- 사용자가 확장 아이콘을 누르면 popup이 열린다.
- popup은 현재 활성 탭 정보를 읽어 URL을 확인한다.
- 현재 탭이 지원 가능한 YouTube 영상 URL이면 다운로드 옵션과 실행 액션을 활성화한다.
- 현재 탭이 지원 대상이 아니면 다운로드 액션을 비활성화하고 지원되지 않는 페이지 상태를 보여준다.

### 다운로드 모드

- 사용자는 오디오와 비디오 중 하나를 선택한다.
- 오디오 모드는 Media Nest API의 오디오 다운로드 계약을 사용한다.
- 비디오 모드는 Media Nest API의 비디오 다운로드 계약을 사용한다.

### 옵션 입력

- 공통 옵션:
  - API base URL
  - 다운로드 파일명 `filename`
- 오디오 옵션:
  - 최대 오디오 비트레이트 `bitrate`
- 비디오 옵션:
  - 최대 영상 높이 `resolution`

빈 옵션은 API 서버 기본 동작에 맡긴다. API 서버는 파일명이 없으면 15자 랜덤 파일명을 사용하고, `bitrate` 또는 `resolution`이 없으면 기본 포맷 selector를 사용한다.

## API 호출 계약

### 서버 기준

- 기본 개발 서버 주소는 `http://127.0.0.1:3030` 또는 사용자가 설정한 API base URL로 다룬다.
- 서버 상태 확인은 `GET /health`를 사용한다.
- CORS는 현재 API 서버에서 전체 허용 상태다.
- `EXTENSION_ID` 기반 origin allowlist는 현재 비활성화되어 있으므로 확장 프로그램 MVP의 필수 조건으로 두지 않는다.

### 오디오 다운로드

YouTube URL을 그대로 전달할 때:

```text
GET /audio?url={MEDIA_URL}
GET /audio?url={MEDIA_URL}&filename={FILENAME}&bitrate={BITRATE}
```

YouTube video ID를 path로 전달할 때:

```text
GET /audio/{YOUTUBE_VIDEO_ID}
GET /audio/{YOUTUBE_VIDEO_ID}?filename={FILENAME}&bitrate={BITRATE}
```

응답은 `audio/mpeg` content type과 attachment disposition을 가진 mp3 파일 다운로드다.

### 비디오 다운로드

YouTube URL을 그대로 전달할 때:

```text
GET /video?url={MEDIA_URL}
GET /video?url={MEDIA_URL}&filename={FILENAME}&resolution={RESOLUTION}
```

YouTube video ID를 path로 전달할 때:

```text
GET /video/{YOUTUBE_VIDEO_ID}
GET /video/{YOUTUBE_VIDEO_ID}?filename={FILENAME}&resolution={RESOLUTION}
```

응답은 `video/mp4` content type과 attachment disposition을 가진 mp4 파일 다운로드다.

## URL 감지 규칙

- 우선 지원 대상은 `youtube.com/watch?v={id}` 형식의 일반 YouTube watch URL이다.
- video ID는 API 서버와 동일하게 11자 YouTube 영상 ID 형식을 기준으로 다룬다.
- `youtu.be/{id}`와 YouTube Shorts URL 지원은 구현 시 함께 고려할 수 있지만, MVP 문서의 필수 성공 조건은 일반 watch URL이다.
- 지원하지 않는 URL에서는 API 호출 URL을 만들지 않는다.

## Popup 상태

| 상태 | 조건 | 사용자 동작 |
| --- | --- | --- |
| Ready | 지원 가능한 YouTube 영상 URL 감지 | 모드와 옵션을 선택해 다운로드 실행 |
| Unsupported page | 현재 탭 URL이 YouTube 영상으로 감지되지 않음 | 다운로드 실행 불가 |
| Missing API URL | API base URL이 비어 있거나 URL 형식이 아님 | 설정값 수정 필요 |
| Checking server | `/health` 확인 중 | 다운로드 실행 대기 |
| Server unavailable | `/health` 요청 실패 또는 비정상 응답 | 서버 실행 상태 확인 필요 |
| Download starting | 다운로드 URL을 열거나 다운로드 API 호출 중 | 중복 실행 방지 |
| Download failed | Chrome 다운로드 시작 실패 또는 API 호출 실패 | 오류 상태 표시 후 재시도 가능 |

## Chrome 권한과 파일 구조

### Manifest

- `activeTab`은 현재 탭 URL 감지에 사용한다.
- `storage`는 API base URL과 기본 옵션 저장에 사용한다.
- `downloads` 권한은 Chrome downloads API로 다운로드를 시작하기로 결정할 경우 필요하다.
- `content_scripts`는 popup 중심 MVP에서는 필수로 보지 않는다. 필요하지 않다면 잘못된 `index.js` 참조를 제거한다.
- `host_permissions`는 최소한 API base URL과 YouTube URL 감지 범위에 맞게 좁히는 방향을 후속 검토한다.

### Popup

- popup HTML은 실제 CSS/JS 상대 경로와 일치해야 한다.
- popup script는 활성 탭 조회, URL 감지, 설정 로드/저장, API URL 생성, 다운로드 실행을 담당한다.
- UI는 다운로드 모드, 파일명, 오디오 비트레이트, 비디오 해상도, API base URL 설정을 제공한다.

## 다운로드 실행 방식 결정

구현 시 아래 두 방식 중 하나를 선택한다.

| 방식 | 장점 | 주의사항 |
| --- | --- | --- |
| 다운로드 URL을 새 탭 또는 현재 창으로 열기 | attachment 응답을 브라우저 기본 다운로드 흐름에 맡길 수 있음 | popup 상태에서 시작 결과를 세밀하게 알기 어려움 |
| `chrome.downloads.download` 사용 | 다운로드 시작 실패를 extension에서 더 명확히 다룰 수 있음 | `downloads` 권한과 URL 접근 권한을 manifest에 반영해야 함 |

MVP에서는 Chrome 확장 프로그램에서 상태 피드백을 명확히 줄 수 있는 `chrome.downloads.download` 방식을 우선 검토한다. 단, 구현 중 권한 또는 CORS 제약이 확인되면 URL 열기 방식으로 축소할 수 있다.

## 검증 기준

- Chrome load unpacked에서 manifest 오류 없이 확장 프로그램이 로드된다.
- popup이 CSS와 script를 정상 로드한다.
- YouTube watch URL에서 11자 video ID를 감지한다.
- 지원하지 않는 탭에서는 다운로드 액션이 비활성화된다.
- 오디오 모드에서 API 오디오 다운로드 URL이 생성된다.
- 비디오 모드에서 API 비디오 다운로드 URL이 생성된다.
- API base URL, `filename`, `bitrate`, `resolution` 설정값이 생성 URL에 반영된다.
- 서버가 꺼져 있을 때 사용자에게 서버 미응답 상태를 보여준다.

## 후속 보류 사항

- API 서버 계약 변경
- `EXTENSION_ID` 기반 CORS allowlist 강제
- YouTube Shorts와 `youtu.be` 지원 확정
- Chrome Web Store 배포 자동화
- shared package로 API client 또는 URL builder 추출
- 실제 다운로드 진행률 표시
