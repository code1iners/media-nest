---
title: Chrome Extension Path Fixes Follow-Up Plan
type: follow-up
status: planned
date: 2026-06-18
---

# Chrome Extension Path Fixes Follow-Up Plan

## Summary

`apps/chrome-extension`에 이관된 현재 소스 snapshot을 실제 Chrome 확장 프로그램으로 로드할 수 있게 경로와 API 호출 흐름을 정리한다.

## Scope

- `manifest.json`의 content script 경로를 실제 파일 배치에 맞춘다.
- `popup/popup.html`의 CSS/JS 상대 경로를 현재 `popup/`, `styles/`, `scripts/` 구조에 맞춘다.
- popup에서 현재 YouTube tab URL 또는 video ID를 읽어 Media Nest API를 호출하는 최소 UI를 구현한다.

## Out Of Scope

- API 서버 계약 변경
- shared package 도입
- Chrome Web Store 배포 자동화

## Verification

- Chrome extension load unpacked 검증
- popup asset 로드 검증
- YouTube tab에서 URL 또는 video ID 추출 검증
- `/audio` 또는 `/video` API 호출 smoke test
