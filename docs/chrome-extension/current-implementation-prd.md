# Media Nest Chrome Extension 현재 구현 PRD

## Problem Statement

Media Nest API 서버는 YouTube 영상 URL 또는 영상 ID를 기반으로 오디오와 비디오 파일 다운로드 응답을 제공한다. Chrome 확장 프로그램 MVP는 `apps/chrome-extension`에서 현재 YouTube watch 탭의 video ID를 감지하고, 사용자가 popup에서 API 다운로드를 시작할 수 있게 한다.

사용자는 YouTube 페이지에서 URL을 복사하고 API 경로와 query string을 직접 조합하지 않고도 오디오 또는 비디오 다운로드를 시작할 수 있어야 한다.

## Solution

Chrome 확장 프로그램 popup은 WXT + React + TypeScript로 구현되어 있다. Popup은 현재 활성 탭의 YouTube 영상 URL을 감지하고, 사용자가 오디오/비디오 다운로드 모드와 선택 옵션을 지정한 뒤 Media Nest API 호출로 파일 다운로드를 시작하게 한다.

API 서버 계약은 `docs/api/current-implementation-prd.md`와 `docs/api/current-implementation-fsd.md`를 기준으로 소비하며, 이번 범위에서는 서버 엔드포인트나 응답 계약을 변경하지 않는다.

## User Stories

1. YouTube 영상을 보고 있는 사용자로서, 나는 popup을 열었을 때 현재 영상이 자동으로 감지되기를 원한다. 그래서 URL을 직접 복사하지 않고 다운로드를 시작할 수 있다.
2. YouTube 영상을 보고 있는 사용자로서, 나는 오디오 다운로드를 선택할 수 있기를 원한다. 그래서 영상에서 mp3 오디오만 추출할 수 있다.
3. YouTube 영상을 보고 있는 사용자로서, 나는 비디오 다운로드를 선택할 수 있기를 원한다. 그래서 현재 영상을 mp4 파일로 받을 수 있다.
4. 다운로드 옵션을 조정하는 사용자로서, 나는 파일명을 입력할 수 있기를 원한다. 그래서 내려받는 파일을 나중에 쉽게 찾을 수 있다.
5. 오디오 다운로드 사용자로서, 나는 오디오 비트레이트 제한을 지정할 수 있기를 원한다. 그래서 API 서버의 `bitrate` 옵션을 popup에서 사용할 수 있다.
6. 비디오 다운로드 사용자로서, 나는 영상 해상도 제한을 지정할 수 있기를 원한다. 그래서 API 서버의 `resolution` 옵션을 popup에서 사용할 수 있다.
7. 로컬 서버를 사용하는 사용자로서, 나는 API base URL을 설정할 수 있기를 원한다. 그래서 개발 또는 배포 환경의 서버 주소에 맞게 확장 프로그램을 사용할 수 있다.
8. 지원하지 않는 페이지에 있는 사용자로서, 나는 현재 탭이 YouTube 영상으로 인식되지 않는다는 상태를 보고 싶다. 그래서 왜 다운로드 버튼을 사용할 수 없는지 알 수 있다.
9. API 서버가 꺼져 있는 사용자로서, 나는 서버 연결 실패 상태를 보고 싶다. 그래서 확장 프로그램 문제가 아니라 서버 실행 상태 문제임을 구분할 수 있다.

## Implementation Decisions

- Chrome 확장 프로그램 문서는 `docs/chrome-extension`이 소유하고, API 서버 문서는 `docs/api`가 소유한다.
- 확장 프로그램 MVP는 현재 활성 탭의 URL을 읽는 popup 중심 흐름으로 정의한다.
- WXT는 extension entrypoint와 generated manifest를 소유하고, React는 popup UI rendering만 담당한다.
- Chrome API, Media Nest API, YouTube URL 감지, popup 상태 전이는 React component 밖의 TypeScript module로 분리한다.
- 현재 Media Nest API 계약을 그대로 사용한다. 오디오는 `/audio/:id`, 비디오는 `/video/:id`를 우선 호출한다.
- API base URL은 기본값 `http://127.0.0.1:3030`을 제공하되, 사용자가 변경 가능한 설정값으로 다룬다.
- 현재 서버 CORS는 전체 허용 상태이므로 MVP 문서에서는 이를 전제로 한다. `EXTENSION_ID` 기반 allowlist 강제는 별도 후속 범위로 둔다.
- popup은 YouTube 영상으로 판단할 수 없는 탭에서는 다운로드 실행 대신 상태 메시지를 보여준다.
- Chrome Web Store 배포, 계정, 다운로드 이력, 작업 큐, 진행률 조회는 이번 문서 범위에 포함하지 않는다.

## Testing Decisions

- 좋은 테스트는 내부 구현 함수 이름보다 사용자가 보는 동작을 기준으로 한다.
- 활성 탭 URL이 `youtube.com/watch?v=...`일 때 video ID를 감지하고 다운로드 액션을 활성화하는지 검증한다.
- 활성 탭 URL이 지원하지 않는 페이지일 때 다운로드 액션을 비활성화하고 안내 상태를 보여주는지 검증한다.
- 오디오 모드가 선택되면 API 서버의 오디오 계약에 맞는 다운로드 URL을 생성하는지 검증한다.
- 비디오 모드가 선택되면 API 서버의 비디오 계약에 맞는 다운로드 URL을 생성하는지 검증한다.
- `filename`, `bitrate`, `resolution`, API base URL 설정값이 API 호출 URL에 반영되는지 검증한다.
- Chrome extension load unpacked 환경에서 WXT generated manifest, popup asset, script 경로가 깨지지 않는지 확인한다.
- package test는 Chrome runtime 없이 URL 감지, API URL 생성, popup 상태 전이를 검증하고, package build는 WXT build output의 manifest/popup 정적 파일 참조를 검증한다.
- browser smoke는 로컬 API `/health`와 built popup의 지원/미지원/다운로드 시작 흐름을 확인한다.

## Out of Scope

- Media Nest API 서버 엔드포인트 변경
- API 서버 인증, 사용자 계정, 권한 관리
- 다운로드 작업 큐와 진행률 조회
- 다운로드 이력 저장
- Chrome Web Store 배포 자동화
- `EXTENSION_ID` 기반 CORS allowlist 강제
- YouTube-only source policy 서버 강제
- shared package 도입

## Further Notes

현재 `apps/chrome-extension` MVP는 popup 중심 흐름으로 구현되어 있다. 일반 YouTube watch URL을 우선 지원하며, Shorts와 `youtu.be` URL, 진행률 표시, Chrome Web Store 배포 자동화는 후속 범위다.
