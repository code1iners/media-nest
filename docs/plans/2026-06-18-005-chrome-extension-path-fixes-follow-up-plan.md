---
title: Chrome Extension Path Fixes Follow-Up Plan
type: follow-up
status: completed
date: 2026-06-18
completed: 2026-06-19
---

# Chrome Extension Path Fixes Follow-Up Plan

## Summary

`apps/chrome-extension`에 이관된 소스 snapshot을 실제 Chrome 확장 프로그램으로 로드할 수 있게 경로와 API 호출 흐름을 정리했다.

## Scope

- `manifest.json`의 broken content script 참조를 제거했다.
- `popup/popup.html`의 CSS/JS 상대 경로를 현재 `popup/`, `styles/`, `scripts/` 구조에 맞췄다.
- popup에서 현재 YouTube watch tab video ID를 읽어 Media Nest API를 호출하는 최소 UI를 구현했다.

## Out Of Scope

- API 서버 계약 변경
- shared package 도입
- Chrome Web Store 배포 자동화
- Shorts와 `youtu.be` URL 지원
- 실제 다운로드 진행률 표시

## Verification

- Chrome extension load unpacked 검증
- popup asset 로드 검증
- YouTube tab에서 URL 또는 video ID 추출 검증
- `/audio/:id` 또는 `/video/:id` API 호출 smoke test
