# MyTube Extract Chrome Extension 현재 구현 FSD

## 문서 기준

이 문서는 Chrome 확장 프로그램이 MyTube Extract API 서버를 소비하는 방식과 현재 MVP의 한계를 정리한다. API 서버 자체의 요청/응답 상세 계약은 `docs/server/endpoints/*`를 기준으로 하며, 여기서는 확장 프로그램의 화면, 상태, 설정, API 호출 조합을 다룬다.

## 현재 소스 상태

- 확장 프로그램 소스는 `apps/chrome-extension` workspace package가 소유한다.
- WXT가 Manifest V3 build output을 생성하며 source `manifest.json`은 두지 않는다.
- popup entrypoint는 `entrypoints/popup/index.html`과 `entrypoints/popup/main.tsx`가 소유한다.
- popup 중심 MVP이므로 `content_scripts`와 background entrypoint는 사용하지 않는다.
- React popup UI는 `src/app/popup-app.tsx`가 소유한다.
- `src/features/popup-download/popup-download-model.ts`는 popup 초기화, 설정 저장/로드, YouTube URL 입력 검증, 현재 탭 URL 가져오기, `/health` 확인, 다운로드 시작 상태 전이를 담당한다.
- `src/adapters/chrome/`는 `chrome.storage`, `chrome.downloads`, `chrome.tabs` callback API를 Promise 기반 adapter로 감싼다.
- `src/domain/download-options/`, `src/services/mytube-extract/`는 Chrome runtime 없이 테스트 가능한 YouTube URL 검증/정규화와 API URL 생성을 담당한다.
- `public/icon-*.png`는 WXT가 generated manifest icon으로 발견해 build output에 복사한다.
- `package.json`의 build script는 WXT production build 후 generated manifest/popup 정적 파일 참조와 permission을 검증하고, test script는 URL 검증, API URL 생성, storage key 호환성, popup 상태 전이를 검증한다.

## 목표 동작

### Popup 진입

- 사용자가 확장 아이콘을 누르면 popup이 열린다.
- Popup은 원본 URL 직접 입력을 기본 다운로드 조건으로 사용한다.
- 사용자는 원본 URL을 직접 입력하거나 현재 탭 URL 가져오기 버튼을 누른다.
- 원본 URL이 비어 있거나 지원 YouTube URL 형식이 아니면 다운로드 액션을 비활성화하고 URL 입력 상태를 보여준다.
- 원본 URL이 유효한 YouTube URL이면 다운로드 옵션과 실행 액션을 활성화한다.

### 다운로드 모드

- 사용자는 오디오와 비디오 중 하나를 선택한다.
- 오디오 모드는 MyTube Extract API의 오디오 URL 다운로드 계약을 사용한다.
- 비디오 모드는 MyTube Extract API의 비디오 URL 다운로드 계약을 사용한다.

### 옵션 입력

- 공통 옵션:
  - 원본 URL `sourceUrl`
  - 다운로드 파일명 `filename`
- 오디오 옵션:
  - 최대 오디오 비트레이트 `bitrate`
- 비디오 옵션:
  - 최대 영상 높이 `resolution`

빈 `filename`, `bitrate`, `resolution`은 API 서버 기본 동작에 맡긴다. API 서버는 파일명이 없으면 15자 랜덤 파일명을 사용하고, `bitrate` 또는 `resolution`이 없으면 기본 포맷 selector를 사용한다.

API base URL은 `WXT_MYTUBE_EXTRACT_API_BASE_URL` 환경 변수로 정하며 popup에서 사용자 입력을 받지 않는다. 운영 값은 `https://media-nest.codeliners.cc`, 로컬 값은 `http://127.0.0.1:5011`만 사용한다. 기존 `WXT_MEDIA_NEST_API_BASE_URL`은 runtime fallback으로, `MYTUBE_EXTRACT_API_BASE_URL`과 `MEDIA_NEST_API_BASE_URL`은 `wxt.config.ts` host permission fallback으로만 지원한다.

## API 호출 계약

### 서버 기준

- 운영 API 서버 주소는 `https://media-nest.codeliners.cc`다.
- 로컬 API 서버 주소는 `http://127.0.0.1:5011`다.
- 서버 상태 확인은 `GET /health`를 사용한다.
- API CORS는 no-origin 요청, 운영 web origin, local preview/dev origin만 허용한다.
- 고정 extension ID 기반 `chrome-extension://...` origin 허용은 현재 제외되어 있으므로 확장 프로그램 MVP의 필수 조건으로 두지 않는다.

### 오디오 다운로드

URL을 그대로 전달한다.

```text
GET /audio?url={MEDIA_URL}
GET /audio?url={MEDIA_URL}&filename={FILENAME}&bitrate={BITRATE}
```

응답은 `audio/mpeg` content type과 attachment disposition을 가진 mp3 파일 다운로드다.

### 비디오 다운로드

URL을 그대로 전달한다.

```text
GET /video?url={MEDIA_URL}
GET /video?url={MEDIA_URL}&filename={FILENAME}&resolution={RESOLUTION}
```

응답은 `video/mp4` content type과 attachment disposition을 가진 mp4 파일 다운로드다.

### 유지되는 서버 호환 계약

API 서버는 기존 YouTube video ID path endpoint도 계속 지원한다.

```text
GET /audio/{YOUTUBE_VIDEO_ID}
GET /video/{YOUTUBE_VIDEO_ID}
```

Chrome 확장 프로그램은 현재 URL query endpoint를 사용한다.

## URL 입력 규칙

- `sourceUrl`은 비어 있으면 안 된다.
- `sourceUrl`은 `youtube.com/watch`, `www.youtube.com/watch`, `youtu.be/{id}`, `www.youtu.be/{id}`, `youtube.com/shorts/{id}`, `www.youtube.com/shorts/{id}` URL이어야 한다.
- `v` query 값은 11자 YouTube video ID 형식이어야 한다.
- `youtu.be`와 Shorts URL은 API 호출 전 `https://www.youtube.com/watch?v={id}` 형식으로 정규화한다.
- 기타 `http/https` URL은 이번 확장 프로그램 MVP에서 지원하지 않는다.
- 입력한 원본 URL은 기본적으로 Chrome storage에 저장하지 않는다.

## Popup 상태

| 상태 | 조건 | 사용자 동작 |
| --- | --- | --- |
| Missing source URL | 원본 URL이 비어 있음 | URL 입력 필요 |
| Invalid source URL | 원본 URL이 지원 YouTube URL 형식이 아님 | URL 수정 필요 |
| Ready | 원본 URL이 유효한 지원 YouTube URL임 | 모드와 옵션을 선택해 다운로드 실행 |
| Checking server | `/health` 확인 중 | 다운로드 실행 대기 |
| Server unavailable | `/health` 요청 실패 또는 비정상 응답 | 서버 상태 확인 또는 재시도 |
| Download starting | 다운로드 URL을 열거나 다운로드 API 호출 중 | 중복 실행 방지 |
| Download failed | Chrome 다운로드 시작 실패 또는 API 호출 실패 | 오류 상태 표시 후 재시도 가능 |

## Chrome 권한과 파일 구조

### Manifest

- `storage`는 파일명, 모드, 비트레이트, 해상도 같은 non-sensitive 기본 옵션 저장에 사용한다.
- `downloads` 권한은 Chrome downloads API로 다운로드를 시작하는 데 사용한다.
- `activeTab`은 사용자가 버튼으로 현재 탭 URL을 가져올 때만 사용한다.
- `content_scripts`는 popup 중심 MVP에서는 사용하지 않는다.
- `host_permissions`는 `WXT_MYTUBE_EXTRACT_API_BASE_URL`, `MYTUBE_EXTRACT_API_BASE_URL`, `WXT_MEDIA_NEST_API_BASE_URL`, `MEDIA_NEST_API_BASE_URL` 순서로 origin을 고르고, 값이 없거나 URL parsing에 실패하면 `https://media-nest.codeliners.cc/*`를 사용한다. 운영 build는 `https://media-nest.codeliners.cc/*`, 로컬 dev는 `http://127.0.0.1:5011/*`만 필요하다.
- manifest 값은 `wxt.config.ts`와 WXT popup entrypoint에서 생성되며, production output은 `.output/chrome-mv3/manifest.json`에 생성된다.

### Popup

- WXT popup entrypoint는 React app mount와 style import를 담당한다.
- Popup application model은 설정 로드/저장, URL 입력 검증, API URL 생성, 다운로드 실행을 담당한다.
- React component는 상태 렌더링과 사용자 입력 전달만 담당한다.
- UI는 원본 URL, 현재 탭 URL 가져오기 버튼, 다운로드 모드, 파일명, 오디오 비트레이트, 비디오 해상도 설정을 제공한다.
- API 서버 주소는 UI에 표시하거나 입력받지 않는다.

## 다운로드 실행 방식 결정

현재 MVP는 `chrome.downloads.download`를 사용한다. 구현 중 권한 또는 런타임 제약이 확인되면 다운로드 URL을 새 탭 또는 현재 창으로 여는 방식으로 축소할 수 있다.

| 방식 | 장점 | 주의사항 |
| --- | --- | --- |
| 다운로드 URL을 새 탭 또는 현재 창으로 열기 | attachment 응답을 브라우저 기본 다운로드 흐름에 맡길 수 있음 | popup 상태에서 시작 결과를 세밀하게 알기 어려움 |
| `chrome.downloads.download` 사용 | 다운로드 시작 실패를 extension에서 더 명확히 다룰 수 있음 | `downloads` 권한과 URL 접근 권한을 manifest에 반영해야 함 |

## 검증 기준

- Chrome load unpacked에서 manifest 오류 없이 확장 프로그램이 로드된다.
- popup이 CSS와 script를 정상 로드한다.
- 원본 URL 입력이 비어 있으면 다운로드 액션이 비활성화된다.
- 원본 URL 입력이 유효하지 않으면 다운로드 액션이 비활성화되고 URL 오류 상태를 보여준다.
- 원본 URL 입력이 유효한 YouTube watch, youtu.be, Shorts URL이면 현재 탭 위치와 관계없이 다운로드 액션이 활성화된다.
- 현재 탭 URL 가져오기 버튼은 지원 YouTube URL을 source URL 입력값으로 반영한다.
- 오디오 모드에서 API 오디오 URL endpoint 다운로드 URL이 생성된다.
- 비디오 모드에서 API 비디오 URL endpoint 다운로드 URL이 생성된다.
- `filename`, `bitrate`, `resolution` 설정값이 생성 URL에 반영된다.
- API base URL은 `WXT_MYTUBE_EXTRACT_API_BASE_URL`을 사용하고 popup UI에서 바꿀 수 없다.
- 서버가 꺼져 있거나 health check가 실패할 때 사용자에게 서버 미응답 상태를 보여준다.
- `pnpm --filter chrome-extension run dev`는 API health와 WXT dev output manifest 준비 상태를 터미널에 표시하고, `http://localhost:3000/popup.html` 개발용 preview를 자동으로 열어 popup UI를 바로 볼 수 있게 해야 한다.
- 개발용 preview는 Chrome extension runtime이 없는 localhost 환경에서만 fake Chrome API를 설치하고, 실제 extension runtime에서는 기존 Chrome API를 그대로 사용해야 한다.
- `pnpm dev:smoke`는 이미 실행 중인 WXT dev output `.output/chrome-mv3-dev`를 load unpacked로 열어 popup 렌더링을 빠르게 확인한다.
- `pnpm --filter chrome-extension run build`가 WXT generated manifest, popup asset, 권한, icon 참조를 검증한다.
- `pnpm --filter chrome-extension run test`가 URL 검증, API URL 생성, storage key 호환성, popup 상태 전이를 검증한다.
- `pnpm --filter chrome-extension run lint`가 WXT type generation과 TypeScript compile을 검증한다.
- `pnpm --filter chrome-extension run test:browser`가 실제 API `/health`, WXT load unpacked 렌더링, built popup의 URL 미입력/서버 실패/다운로드 시작 흐름을 검증한다.

## 후속 보류 사항

- API 서버 계약 변경
- 고정 extension ID 기반 CORS 허용
- Chrome Web Store 배포 자동화
- shared package로 API client 또는 URL builder 추출
- 실제 다운로드 진행률 표시
- 입력 URL 저장 또는 최근 URL 목록
