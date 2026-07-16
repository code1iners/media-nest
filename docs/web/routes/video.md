# Web Route `/video`

## Route

- path: `/video`
- source file: `apps/web/src/app/pages/video-extract/page.tsx`
- logic hook: `apps/web/src/app/pages/video-extract/_hooks/use-video-extract-logic.ts`
- navigation entry: fixed bottom tab `영상 추출`
- shared layout: `apps/web/src/app/components/app-layout.tsx`
- shared hero: `apps/web/src/app/components/app-hero.tsx`

## 사용자 흐름

1. 공통 `MyTube Extract` 상단 header 아래 영상 추출 요청 설정만 표시한다.
2. YouTube URL을 입력한다. 빈 값이나 지원하지 않는 URL이면 URL 필드 근처에서 이유를 텍스트로 확인한다.
3. `오디오 (MP3)` 또는 `비디오 (MP4)` 추출 형식을 선택한다.
4. 형식별 품질을 선택한다.
5. `추출 요청`을 누른다.
6. 앱은 worker 상태를 확인한 뒤 `/downloads` job을 생성한다.
7. 요청 시작 직후부터 요청 설정을 숨기고 처리 상태만 표시하며, job 생성 뒤 terminal 상태까지 `/downloads/:jobId`를 polling한다.
8. 요청 생성 중이거나 terminal 상태 전이면 하단 navigation으로 다른 route 이동을 막는다.
9. 완료되면 결과 화면에서 다운로드 링크와 `새 요청`을 표시한다. 요청·job 실패와 만료는 오류 화면에서 복구 동작만 표시한다.

## API

- `GET /health`: worker 사용 가능 여부 확인
- `POST /downloads`: 다운로드 job 생성
- `GET /downloads/:jobId`: job 상태 polling
- `GET {downloadUrl}`: 완료 파일 다운로드

## 주요 상태

- 입력 검증 실패: submit 비활성화, URL 필드 근처의 텍스트 안내, 형식 오류 입력 상태 표시
- 최초 health 확인 중: 요청 설정을 유지하고 `서비스 상태를 확인 중입니다.`를 `role="status"`로 표시하며 재시도 버튼은 숨김
- 요청 전 worker unavailable/health 확인 실패: 요청 설정을 유지하고 submit을 비활성화하며 `다시 확인`을 표시
- 요청 실패 또는 진행 중 job의 worker unavailable/health 확인 실패: 오류 화면과 복구 동작 표시
- queued/processing: 처리 상태와 진행률만 표시
- completed: API base URL과 `downloadUrl`을 결합한 다운로드 링크 및 `새 요청` 표시
- failed/expired/요청 오류: 오류와 요청 설정 복귀 동작만 표시
- in progress: 다른 하단 navigation route로 이동 차단

## 검증

- `pnpm --filter web run lint`
- Browser smoke: `/video` 직접 접근, 공통 hero 표시, `영상 추출` navigation active, 진행 중 `자막 추출` 이동 차단, fixed tab 표시, 하단 콘텐츠 겹침 없음
