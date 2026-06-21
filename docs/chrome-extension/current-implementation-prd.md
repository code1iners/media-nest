# Media Nest Chrome Extension 현재 구현 PRD

## Problem Statement

Media Nest API 서버는 URL 또는 YouTube 영상 ID를 기반으로 오디오와 비디오 파일 다운로드 응답을 제공한다. Chrome 확장 프로그램은 사용자가 어떤 페이지에 있든 popup을 열고 YouTube watch URL을 직접 입력해 추출을 시작할 수 있게 한다.

사용자는 YouTube 페이지에 먼저 들어가거나 API 경로와 query string을 직접 조합하지 않고도, 가진 YouTube watch URL만으로 오디오 또는 비디오 다운로드를 시작할 수 있어야 한다.

## Solution

Chrome 확장 프로그램 popup은 WXT + React + TypeScript로 구현되어 있다. Popup은 사용자가 입력한 YouTube watch URL, 추출 형식, 선택 옵션을 조합해 환경 변수로 정한 Media Nest API로 다운로드를 시작한다.

API 서버 계약은 `docs/api/current-implementation-prd.md`와 `docs/api/current-implementation-fsd.md`를 기준으로 소비하며, 이번 범위에서는 서버 엔드포인트나 응답 계약을 변경하지 않는다.

## User Stories

1. YouTube watch URL을 가진 사용자로서, 나는 어떤 페이지에서든 popup을 열고 URL을 입력하고 싶다. 그래서 현재 탭 위치와 관계없이 추출을 시작할 수 있다.
2. 오디오 다운로드 사용자로서, 나는 오디오 다운로드를 선택할 수 있기를 원한다. 그래서 URL의 미디어에서 mp3 오디오만 추출할 수 있다.
3. 비디오 다운로드 사용자로서, 나는 비디오 다운로드를 선택할 수 있기를 원한다. 그래서 URL의 미디어를 mp4 파일로 받을 수 있다.
4. 다운로드 옵션을 조정하는 사용자로서, 나는 파일명을 입력할 수 있기를 원한다. 그래서 내려받는 파일을 나중에 쉽게 찾을 수 있다.
5. 오디오 다운로드 사용자로서, 나는 오디오 비트레이트 제한을 지정할 수 있기를 원한다. 그래서 API 서버의 `bitrate` 옵션을 popup에서 사용할 수 있다.
6. 비디오 다운로드 사용자로서, 나는 영상 해상도 제한을 지정할 수 있기를 원한다. 그래서 API 서버의 `resolution` 옵션을 popup에서 사용할 수 있다.
7. 일반 사용자로서, 나는 API 서버 주소를 직접 설정하지 않고 운영 API를 사용하고 싶다. 그래서 설정 없이 바로 추출할 수 있다.
8. 잘못된 URL을 입력한 사용자로서, 나는 URL 입력 상태를 보고 싶다. 그래서 왜 다운로드 버튼을 사용할 수 없는지 알 수 있다.
9. API 서버에 연결할 수 없는 사용자로서, 나는 서버 연결 실패 상태를 보고 싶다. 그래서 확장 프로그램 문제가 아니라 서버 상태 문제임을 구분할 수 있다.

## Implementation Decisions

- Chrome 확장 프로그램 문서는 `docs/chrome-extension`이 소유하고, API 서버 문서는 `docs/api`가 소유한다.
- 확장 프로그램은 URL 직접 입력 popup 흐름으로 정의한다.
- WXT는 extension entrypoint와 generated manifest를 소유하고, React는 popup UI rendering만 담당한다.
- Chrome storage/downloads API, Media Nest API URL 생성, popup 상태 전이는 React component 밖의 TypeScript module로 분리한다.
- 현재 Media Nest API 계약을 그대로 사용한다. 오디오는 `/audio?url={MEDIA_URL}`, 비디오는 `/video?url={MEDIA_URL}`을 호출한다.
- API base URL은 `WXT_MEDIA_NEST_API_BASE_URL` 환경 변수로 정하고 사용자 입력 UI를 제공하지 않는다. 운영 값은 `https://media-nest.codeliners.cc`, 로컬 값은 `http://127.0.0.1:3030`만 사용한다.
- 파일명, 오디오 비트레이트, 비디오 해상도는 선택 옵션으로 유지한다.
- 입력한 원본 URL은 기본적으로 Chrome storage에 저장하지 않는다.
- 현재 서버 CORS는 전체 허용 상태이므로 MVP 문서에서는 이를 전제로 한다. `EXTENSION_ID` 기반 allowlist 강제는 별도 후속 범위로 둔다.
- Chrome Web Store 배포, 계정, 다운로드 이력, 작업 큐, 진행률 조회는 이번 문서 범위에 포함하지 않는다.

## Testing Decisions

- 좋은 테스트는 내부 구현 함수 이름보다 사용자가 보는 동작을 기준으로 한다.
- 원본 URL이 비어 있을 때 다운로드 액션을 비활성화하고 URL 입력 상태를 보여주는지 검증한다.
- 원본 URL이 YouTube watch URL일 때 다운로드 액션을 활성화하는지 검증한다.
- 원본 URL 형식이 올바르지 않을 때 다운로드 액션을 비활성화하고 URL 오류 상태를 보여주는지 검증한다.
- 오디오 모드가 선택되면 API 서버의 URL 기반 오디오 계약에 맞는 다운로드 URL을 생성하는지 검증한다.
- 비디오 모드가 선택되면 API 서버의 URL 기반 비디오 계약에 맞는 다운로드 URL을 생성하는지 검증한다.
- `filename`, `bitrate`, `resolution` 설정값이 API 호출 URL에 반영되는지 검증한다.
- API base URL이 popup UI나 storage 사용자 설정으로 바뀌지 않는지 검증한다.
- Chrome extension load unpacked 환경에서 WXT generated manifest, popup asset, script 경로가 깨지지 않는지 확인한다.
- package test는 Chrome runtime 없이 URL 검증, API URL 생성, popup 상태 전이를 검증하고, package build는 WXT build output의 manifest/popup 정적 파일 참조를 검증한다.
- browser smoke는 built popup의 URL 미입력, 서버 실패, 다운로드 시작 흐름을 확인한다.

## Out of Scope

- Media Nest API 서버 엔드포인트 변경
- API 서버 인증, 사용자 계정, 권한 관리
- 다운로드 작업 큐와 진행률 조회
- 다운로드 이력 저장
- Chrome Web Store 배포 자동화
- `EXTENSION_ID` 기반 CORS allowlist 강제
- YouTube-only source policy 서버 강제
- 현재 탭 URL 자동 가져오기 버튼
- 입력 URL 저장 또는 최근 URL 목록
- shared package 도입

## Further Notes

현재 `apps/chrome-extension` MVP는 YouTube watch URL 입력 popup 중심 흐름으로 구현되어 있다. 진행률 표시, Chrome Web Store 배포 자동화, 현재 탭 URL 가져오기, 최근 URL 저장은 후속 범위다.
