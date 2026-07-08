# Web Route `/subtitles`

## Route

- path: `/subtitles`
- source file: `apps/web/src/app/pages/subtitles-extract/page.tsx`
- logic hook: `apps/web/src/app/pages/subtitles-extract/_hooks/use-subtitles-extract-logic.ts`
- navigation entry: fixed bottom tab `자막 추출`
- shared layout: `apps/web/src/app/components/app-layout.tsx`
- shared hero: `apps/web/src/app/components/app-hero.tsx`

## 사용자 흐름

1. 사용자가 fixed bottom navigation의 `자막 추출`을 누르거나 `/subtitles`에 직접 접근한다.
2. 앱은 공통 `MyTube Extract` 상단 hero 아래 영어 SRT 생성 화면을 표시한다.
3. 사용자가 로컬 영상 파일을 선택하거나 dropzone에 드롭한다.
4. 앱은 `mp4`, `mov`, `webm` 파일인지 검증한다.
5. 사용자가 Whisper 모델을 `빠름 · base.en` 또는 `정확도 · small.en` 중 선택한다.
6. 앱은 영상 metadata에서 길이를 읽어 선택 모델 기준 예상 처리 시간을 표시한다.
7. `영어 SRT 생성`을 누른다.
8. 앱은 worker 상태를 확인한 뒤 `/subtitles/uploads`로 R2 direct upload session을 생성한다.
9. 앱은 presigned URL에 영상 part를 직접 `PUT`으로 업로드하고 진행률을 표시한다.
10. 앱은 `/subtitles/uploads/complete`로 자막 job을 생성한다.
11. terminal 상태까지 `/subtitles/jobs/:jobId`를 polling한다.
12. 요청 생성 중이거나 terminal 상태 전이면 하단 navigation으로 다른 route 이동을 막는다.
13. 완료되면 영어 SRT 다운로드 링크를 표시한다.

## 현재 표시 내용

- 제목: `영어 SRT 생성`
- 입력: 로컬 영상 파일 선택/dropzone
- 모델: `빠름 · base.en`, `정확도 · small.en`
- 예상 시간: 영상 길이와 선택 모델 기준 대략치
- CTA: `영어 SRT 생성`
- 상태 단계: `파일 선택`, `대기`, `음성 추출`, `SRT 생성`, `완료`
- 결과 액션: `영어 SRT 다운로드`, 비활성 `한글로 번역`

## API

- `GET /health`: worker 사용 가능 여부 확인
- `POST /subtitles/uploads`: R2 direct upload session 생성
- R2 presigned URL `PUT`: 영상 part 직접 업로드
- `POST /subtitles/uploads/complete`: R2 multipart upload 완료와 자막 job 생성
- `POST /subtitles/uploads/abort`: 실패한 R2 multipart upload 정리
- `GET /subtitles/jobs/:jobId`: job 상태 polling
- `GET {downloadUrl}`: 완료 SRT 다운로드

## 주요 상태

- 입력 검증 실패: submit 비활성화
- worker unavailable: `자막 추출 기능을 사용할 수 없습니다`
- health 확인 실패: `서비스 상태를 확인할 수 없습니다`
- 업로드 용량 초과: 선택한 파일 크기를 포함한 용량 초과 안내
- R2 direct upload 실패: 실패 안내와 상세 원인 보기
- 파일 선택 전: `파일 선택` 단계 선택
- 유효 파일 선택 후: `대기` 단계 선택
- R2 direct upload 중: 업로드 진행률 표시
- queued/extracting_audio/transcribing/completed/failed/expired: 상태 패널과 진행률 표시
- completed: API base URL과 `downloadUrl`을 결합한 다운로드 링크 표시
- in progress: 다른 하단 navigation route로 이동 차단

## 미구현 범위

- `docs/unimplemented/current-unimplemented.md`

## 검증

- `pnpm --filter web run lint`
- Browser smoke: `/subtitles` 직접 접근, 공통 hero 표시, `자막 추출` navigation active, fixed tab 표시, 하단 콘텐츠 겹침 없음
