# Web Route `/video`

## Route

- path: `/video`
- source file: `apps/web/src/app/pages/video-extract/page.tsx`
- logic hook: `apps/web/src/app/pages/video-extract/_hooks/use-video-extract-logic.ts`
- navigation entry: fixed bottom tab `영상 추출`
- shared layout: `apps/web/src/app/components/app-layout.tsx`
- shared hero: `apps/web/src/app/components/app-hero.tsx`

## 사용자 흐름

1. 공통 `MyTube Extract` 상단 hero 아래 영상 추출 본문을 표시한다.
2. YouTube URL을 입력한다.
3. `오디오 (MP3)` 또는 `비디오 (MP4)` 추출 형식을 선택한다.
4. 형식별 품질을 선택한다.
5. `추출 요청`을 누른다.
6. 앱은 worker 상태를 확인한 뒤 `/downloads` job을 생성한다.
7. terminal 상태까지 `/downloads/:jobId`를 polling한다.
8. 요청 생성 중이거나 terminal 상태 전이면 하단 navigation으로 다른 route 이동을 막는다.
9. 완료되면 다운로드 링크를 표시한다.

## API

- `GET /health`: worker 사용 가능 여부 확인
- `POST /downloads`: 다운로드 job 생성
- `GET /downloads/:jobId`: job 상태 polling
- `GET {downloadUrl}`: 완료 파일 다운로드

## 주요 상태

- 입력 검증 실패: submit 비활성화
- worker unavailable: `추출 기능을 사용할 수 없습니다`
- health 확인 실패: `서비스 상태를 확인할 수 없습니다`
- queued/processing/completed/failed/expired: 상태 패널과 진행률 표시
- completed: API base URL과 `downloadUrl`을 결합한 다운로드 링크 표시
- in progress: 다른 하단 navigation route로 이동 차단

## 검증

- `pnpm --filter web run lint`
- Browser smoke: `/video` 직접 접근, 공통 hero 표시, `영상 추출` navigation active, 진행 중 `자막 추출` 이동 차단, fixed tab 표시, 하단 콘텐츠 겹침 없음
