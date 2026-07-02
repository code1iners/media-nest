# Web Route `/subtitles`

## Route

- path: `/subtitles`
- source file: `apps/web/src/app/pages/subtitles-extract/page.tsx`
- navigation entry: fixed bottom tab `자막 추출`
- shared layout: `apps/web/src/app/components/app-layout.tsx`
- shared hero: `apps/web/src/app/components/app-hero.tsx`

## 사용자 흐름

1. 사용자가 fixed bottom navigation의 `자막 추출`을 누르거나 `/subtitles`에 직접 접근한다.
2. 앱은 공통 `MyTube Extract` 상단 hero 아래 자막 추출 placeholder 화면을 표시한다.

## 현재 표시 내용

- 제목: `자막 추출`
- 본문: `준비 중입니다.`

## API

- 현재 호출 없음

## 미구현 범위

- 자막 추출 form
- 자막 추출 API 계약
- 자막 파일 또는 텍스트 다운로드 흐름

## 검증

- `pnpm --filter web run lint`
- Browser smoke: `/subtitles` 직접 접근, 공통 hero 표시, `자막 추출` navigation active, fixed tab 표시, 하단 콘텐츠 겹침 없음
