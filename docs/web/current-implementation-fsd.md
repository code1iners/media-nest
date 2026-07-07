# MyTube Extract Web 현재 구현 FSD

## 문서 기준

이 문서는 `apps/web` Vite CSR 앱이 MyTube Extract API를 소비하는 방식을 정리한다. API 요청/응답 상세 계약은 `docs/api/current-implementation-fsd.md`를 기준으로 한다.

## 현재 소스 상태

- web 앱 소스는 `apps/web` workspace package가 소유한다.
- 진입점은 `src/main.tsx`, router shell은 `src/app/app.tsx`다.
- `src/main.tsx`는 React Query `QueryClientProvider`를 제공한다.
- `src/app/app.tsx`는 `react-router` Declarative mode의 `BrowserRouter`, `Routes`, `Route`를 구성한다.
- route path 상수는 `src/app/constants/route-paths.constant.ts`가 관리한다.
- 공통 layout은 `src/app/components/app-layout.tsx`가 담당하며 공통 상단 hero, route 본문 `Outlet`, 하단 고정 탭을 배치한다.
- 공통 상단 hero는 `src/app/components/app-hero.tsx`가 담당한다.
- 하단 고정 탭은 `src/app/components/bottom-tab-bar.tsx`가 담당하며 `NavLink`와 route path 상수를 사용한다.
- 추출 요청 생성 중이거나 다운로드 job이 terminal 상태가 아니면 하단 탭의 다른 route 이동을 차단한다.
- 정의되지 않은 route는 `/video`로 redirect한다.
- 영상 추출 route는 `src/app/pages/video-extract/page.tsx`와 `src/app/pages/video-extract/_hooks/use-video-extract-logic.ts`가 담당한다.
- 자막 추출 route는 `src/app/pages/subtitles-extract/page.tsx`와 `src/app/pages/subtitles-extract/_hooks/use-subtitles-extract-logic.ts`가 담당한다.
- 다운로드 요청 검증은 `src/domain/download-request/download-request.ts`가 담당한다.
- 자막 파일 입력 검증은 `src/domain/subtitle-request/subtitle-request.ts`가 담당한다.
- MyTube Extract API 호출은 `src/api/mytube-extract.api.ts`가 담당한다.
- `src/app/components/error-boundary.tsx`는 예상하지 못한 렌더링 오류를 빈 화면 대신 안내 화면으로 바꾼다.
- `src/app/components/error-details-disclosure.tsx`는 사용자가 클릭해서 상세 원인 로그를 확인하고 복사할 수 있게 한다.
- 픽셀 UI asset과 icon component는 `src/app/components/pixel-art.tsx`가 담당한다.
- `public/manifest.webmanifest`와 `public/mytube-extract-icon.svg`는 PWA metadata로 build output에 포함된다.
- `tools/verify-pwa-package.js`는 production build 뒤 manifest 참조, standalone display, icon 존재를 검증한다.
- `vercel.json`은 직접 route 접근 시 Vite SPA가 `index.html`로 fallback되도록 rewrite를 설정한다.

## Route 계약

상세 route 계약은 아래 문서를 기준으로 한다.

- `docs/web/routes/video.md`
- `docs/web/routes/subtitles.md`

현재 route 구성:

- `/`: `/video`로 redirect
- `/video`: 영상 추출 화면
- `/subtitles`: 자막 추출 화면
- `*`: `/video`로 redirect

## 환경 설정

- 로컬 dev API 기본값: `http://127.0.0.1:3030`
- production API 기본값: `https://media-nest.codeliners.cc`
- 우선 환경 변수: `VITE_MYTUBE_EXTRACT_API_BASE_URL`
- 전환 기간 fallback: `VITE_MEDIA_NEST_API_BASE_URL`
- Vite dev server 기본 port: `5010`

## 화면 흐름

1. 사용자가 `/`에 접근하면 앱은 `/video`로 redirect한다.
2. 모든 route는 공통 `MyTube Extract` 상단 hero를 공유한다.
3. 사용자는 fixed bottom tab으로 `/video`, `/subtitles` route를 이동한다.
4. 잘못된 route에 접근하면 앱은 `/video`로 redirect한다.
5. `/video`에서 사용자가 YouTube URL을 입력한다.
6. 사용자가 오디오 또는 비디오 모드를 선택한다.
7. 사용자가 모드별 품질을 선택한다.
8. 앱이 React Query `useQuery`로 `GET /health` worker 상태를 진입 시와 주기적으로 확인한다.
9. submit 직전 React Query `useMutation`이 worker health를 다시 확인한다.
10. worker가 사용 가능하면 앱이 `POST /downloads`로 job을 만든다.
11. 앱이 terminal 상태까지 `GET /downloads/:jobId`를 2500ms 간격으로 polling한다.
12. job 생성 요청 중이거나 terminal 상태 전이면 하단 탭으로 다른 route 이동을 시도해도 이동하지 않는다.
13. `completed` 상태가 되면 `downloadUrl`을 API base URL과 결합해 다운로드 링크를 보여준다.
14. 다운로드 파일명은 web 앱이 강제하지 않고 API의 `Content-Disposition` attachment 파일명을 따른다.
15. `/subtitles`에서 사용자가 로컬 영상 파일을 선택하거나 dropzone에 드롭한다.
16. 앱은 `mp4`, `mov`, `webm` 파일인지 검증한다.
17. 사용자는 `base_en` 또는 `small_en` Whisper 모델을 선택한다. 기본값은 `base_en`이다.
18. 앱은 선택한 영상 metadata에서 길이를 읽어 모델별 예상 처리 시간을 표시한다.
19. `영어 SRT 생성`을 누르면 submit 직전 worker health를 다시 확인한다.
20. worker가 사용 가능하면 앱이 `POST /subtitles/jobs`로 multipart job을 만든다.
21. 앱이 terminal 상태까지 `GET /subtitles/jobs/:jobId`를 2500ms 간격으로 polling한다.
22. `completed` 상태가 되면 `downloadUrl`을 API base URL과 결합해 영어 SRT 다운로드 링크를 보여준다.
23. `한글로 번역` 버튼은 CTA 2 위치만 표시하고 비활성 상태로 둔다.

worker 미가용 흐름:

- `GET /health`의 `worker.available`이 `false`이면 submit button을 비활성화한다.
- 상태 영역 제목에는 `추출 기능을 사용할 수 없습니다`를 표시한다.
- 상태 영역 본문에는 `현재 추출 서버가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.`를 표시한다.
- 사용자 문구는 운영 시간이 정해져 있다는 인상을 주지 않도록 `서비스 시간` 표현을 쓰지 않는다.
- job polling 중 health polling 결과가 미가용으로 바뀌어도 같은 문구를 표시한다.

서비스 상태 확인 실패 흐름:

- `GET /health` 응답에 `worker.available`이 없거나 boolean이 아니면 API client가 `SERVICE_STATUS_FORMAT_ERROR`로 처리한다.
- 앱은 기존 화면을 유지하고 submit button을 비활성화한다.
- 상태 영역 제목에는 `서비스 상태를 확인할 수 없습니다`를 표시한다.
- 상태 영역 본문에는 `서버 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.`를 표시한다.
- 사용자는 `상세 원인 보기`를 눌러 오류 코드, 발생 위치, 요청 경로, 응답 상태, 응답 내용을 확인할 수 있다.
- `원인 복사` 버튼은 표시된 상세 원인 로그만 복사한다.

예상하지 못한 화면 오류 흐름:

- ErrorBoundary fallback 제목에는 `화면을 불러오지 못했습니다`를 표시한다.
- fallback 본문에는 `일시적인 문제가 발생했습니다. 새로고침 후 다시 시도해 주세요.`를 표시한다.
- 사용자는 `새로고침` 버튼으로 페이지를 다시 불러올 수 있다.
- 사용자는 `상세 원인 보기`를 눌러 오류 코드와 발생 위치를 확인할 수 있다.

## 입력 규칙

- `sourceUrl`은 필수다.
- 지원 URL은 `youtube.com/watch`, `www.youtube.com/watch`, `youtu.be/{id}`, `youtube.com/shorts/{id}`, `www.youtube.com/shorts/{id}`다.
- YouTube video ID는 11자 `[a-zA-Z0-9_-]` 형식이어야 한다.
- `mode`는 `audio` 또는 `video`다.
- `quality`는 audio `128`/`192`/`320`, video `360`/`720`/`1080` 중 하나다.
- 초기 기본값은 `mode: "audio"`, `quality: "320"`이며, mode 변경 시 `quality`는 해당 mode 기본값(audio `"320"`, video `"1080"`)으로 재설정된다.
- 자막 추출 파일은 `mp4`, `mov`, `webm`만 허용한다.
- 자막 추출은 영어 SRT만 생성하며 언어와 포맷 선택 UI를 제공하지 않는다.
- Whisper 모델은 `base_en`, `small_en` 중 하나를 선택한다.

## API 호출 계약

### `GET /health`

```json
{
  "ok": true,
  "worker": {
    "available": true
  }
}
```

앱은 `worker.available`만 보고 추출 요청 가능 여부를 판단한다.

### `POST /downloads`

```json
{
  "type": "audio",
  "url": "https://www.youtube.com/watch?v=...",
  "quality": "192"
}
```

### `GET /downloads/:jobId`

앱은 API 응답의 `displayStatus`, `progress`, `message`, `retentionDays`, `downloadUrl`을 그대로 화면에 반영한다.

### `POST /subtitles/jobs`

앱은 `FormData`의 `file` 필드로 선택된 로컬 영상 파일을, `whisperModel` 필드로 선택한 `base_en` 또는 `small_en` 값을 전송한다.

### `GET /subtitles/jobs/:jobId`

앱은 API 응답의 `displayStatus`, `stage`, `progress`, `message`, `retentionDays`, `downloadUrl`을 그대로 화면에 반영한다.

### 완료 파일 링크

API가 `downloadUrl`로 `/downloads/{jobId}/file` 또는 `/subtitles/jobs/{jobId}/file` 같은 path를 주면 앱은 현재 API base URL과 결합한다.
앱은 `download` 속성으로 별도 파일명을 지정하지 않는다. 새 추출 asset과 SRT는 API가 `Content-Disposition` 파일명을 내려준다.

## 상태 표시

- `queued`: 대기 중, 진행률 0
- `processing`: 처리 중, 진행률 50
- `completed`: 다운로드 가능, 진행률 100
- `failed`: 재시도 필요
- `expired`: 재추출 필요
- subtitle `queued`: 대기 중, 진행률 10
- subtitle `extracting_audio`: 음성 추출 중, 진행률 40
- subtitle `transcribing`: SRT 생성 중, 진행률 70
- subtitle `completed`: 영어 SRT 다운로드 가능, 진행률 100
- subtitle `failed`: 재시도 필요
- subtitle UI step `file_select`: 파일 선택 전 표시 전용 단계
- worker unavailable: 추출 기능 사용 불가 안내
- service status format error: 서비스 상태 확인 실패 안내와 상세 원인 보기
- unexpected render error: 화면 오류 안내와 상세 원인 보기

## 검증 기준

- `pnpm --filter web run test`: URL 검증, API client, worker health 응답 처리를 검증한다.
- `pnpm --filter web run lint`: TypeScript compile을 검증한다.
- `pnpm --filter web run build`: Vite production build와 PWA package 검증을 실행한다.
- Browser smoke: `/`, `/video`, `/subtitles`, unknown route 직접 접근, 공통 hero 표시, bottom navigation active 상태, 진행 중 탭 이동 차단, fixed tab 폭/겹침 여부를 확인한다.

## 후속 보류 사항

- 사용자 계정과 작업 이력
- 파일명 입력
- API base URL 화면 설정
- yt-dlp stderr 기반 세부 진행률
- web 앱 e2e/browser smoke
- 자막 한글 번역 CTA 2 구현
