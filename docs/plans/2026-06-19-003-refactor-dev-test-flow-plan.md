---
title: Improve Dev Test Flow
type: refactor
status: completed
date: 2026-06-19
completed: 2026-06-19
---

# Improve Dev Test Flow

## Summary

`pnpm dev`를 실행한 뒤 개발자가 곧바로 Chrome extension popup을 확인할 수 있도록 local dev readiness와 browser smoke 흐름을 정리한다. 목표는 production build smoke와 WXT dev mode를 혼동하지 않게 분리하면서, root dev 실행만으로 API health, WXT dev output, extension 로드 가능 상태를 빠르게 알 수 있게 만드는 것이다.

---

## Problem Frame

현재 root `pnpm dev`는 Turbo persistent task로 API dev server와 WXT dev server를 병렬 실행한다. 하지만 개발자가 어느 Chrome 창을 봐야 하는지, API가 준비됐는지, load-unpacked 대상이 dev output인지 production output인지가 실행 직후 명확하지 않다. 별도 `test:browser`는 production build를 새로 만들고 Playwright smoke를 돌리므로, `pnpm dev` 직후 수동 테스트 경험과는 목적이 다르다.

---

## Requirements

- R1. root `pnpm dev` 후 API server와 WXT extension dev output이 준비됐는지 명확히 보여야 한다.
- R2. WXT dev mode와 production build load-unpacked smoke의 목적과 output 경로를 분리해야 한다.
- R3. dev 중 빠른 확인은 watch process를 방해하지 않아야 한다.
- R4. 기존 `test:browser`는 production output 검증으로 유지해야 한다.
- R5. 실패 시 API 미기동, WXT output 미생성, popup 런타임 오류를 구분해 디버깅할 수 있어야 한다.

---

## Scope Boundaries

- Chrome extension 기능 범위는 변경하지 않는다.
- API endpoint, CORS 정책, 다운로드 처리 로직은 변경하지 않는다.
- Shorts, `youtu.be`, 진행률 표시, options page는 포함하지 않는다.
- CI용 headless browser suite 확장은 이번 범위에 포함하지 않는다.

### Deferred to Follow-Up Work

- dev server가 특정 YouTube 테스트 URL을 자동으로 여는 기능은 WXT runner 설정 검증 후 별도 판단한다.
- Chrome Web Store 배포 전용 검증은 production release plan에서 다룬다.

---

## Context & Research

### Relevant Code and Patterns

- `package.json`: root `dev`는 `turbo run dev --parallel`이다.
- `turbo.json`: `dev` task는 `persistent: true`, `cache: false`로 설정되어 있다.
- `apps/api/package.json`: API `dev`와 `start:dev`가 Nest watch server를 실행한다.
- `apps/chrome-extension/package.json`: extension `dev`는 현재 `wxt`를 직접 실행한다.
- `apps/chrome-extension/tests/browser/popup-smoke.mjs`: production output `.output/chrome-mv3`와 실제 API health를 기준으로 browser smoke를 수행한다.
- `apps/chrome-extension/tools/verify-extension-package.js`: production build output의 manifest와 popup asset 참조를 검증한다.
- `README.md`: WXT dev mode와 production build load-unpacked 검증을 이미 구분해서 설명한다.
- `docs/chrome-extension/current-implementation-fsd.md`: 검증 기준에 local API health, generated manifest, browser smoke가 포함되어 있다.

### Key Observation

`pnpm dev` 자체를 test runner로 바꾸면 persistent watch flow가 흔들릴 수 있다. 대신 extension dev process가 readiness probe를 함께 수행하고, production smoke는 기존 `test:browser`로 유지하는 구성이 가장 작고 안전하다.

---

## Key Technical Decisions

- Keep root `pnpm dev` as the single local entrypoint: 개발자는 root에서 한 명령만 실행하고, API와 extension readiness를 같은 터미널 흐름에서 확인한다.
- Wrap extension dev script instead of changing Turbo semantics: `apps/chrome-extension`의 dev script가 WXT를 실행하면서 readiness probe를 담당하면 root Turbo task 구조를 크게 바꾸지 않아도 된다.
- Split dev readiness from production smoke: dev readiness는 `.output/chrome-mv3-dev`와 API health를 확인하고, `test:browser`는 `.output/chrome-mv3` production build 검증으로 남긴다.
- Reuse browser smoke logic carefully: output root와 API base URL을 parameterize하되, production smoke의 엄격한 build verification은 유지한다.
- Prefer actionable terminal output: readiness 실패 메시지는 "어디를 봐야 하는지"를 알려야 하며, 단순히 timeout만 던지지 않는다.

---

## Implementation Units

### U1. Define Dev Readiness Contract

**Goal:** `pnpm dev` 직후 무엇이 준비 상태인지 repo 문서와 script 계약에서 명확히 정의한다.

**Requirements:** R1, R2, R5

**Dependencies:** None

**Files:**

- Modify: `README.md`
- Modify: `docs/chrome-extension/current-implementation-fsd.md`
- Test: none -- documentation and contract clarification only

**Approach:** dev readiness를 API `/health` 성공, WXT dev output manifest 생성, popup debug target 안내가 표시된 상태로 정의한다. production smoke는 build output 검증과 browser flow 검증으로 별도 유지한다고 명시한다.

**Patterns to follow:** 기존 README의 Chrome Extension 섹션과 FSD의 검증 기준 표기 방식.

**Test scenarios:** Test expectation: none -- 문서 계약 정리이며 동작 변경은 U2 이후에서 검증한다.

**Verification:** 문서만 보고도 개발자가 dev mode와 production smoke의 차이를 구분할 수 있어야 한다.

### U2. Add Extension Dev Wrapper With Readiness Probe

**Goal:** extension `dev` script가 WXT를 실행하면서 API와 WXT dev output readiness를 함께 확인하게 한다.

**Requirements:** R1, R3, R5

**Dependencies:** U1

**Files:**

- Modify: `apps/chrome-extension/package.json`
- Create: `apps/chrome-extension/tools/run-wxt-dev-ready.js`
- Test: `apps/chrome-extension/tests/browser/`

**Approach:** wrapper는 WXT process를 child process로 실행하고, 별도 비동기 probe로 API health와 `.output/chrome-mv3-dev/manifest.json` 생성을 기다린다. 준비되면 Chrome extension debugging 대상, API base URL, 지원 URL 범위를 터미널에 출력한다. WXT process의 stdout/stderr와 종료 코드는 그대로 전달한다.

**Patterns to follow:** `apps/chrome-extension/tools/verify-extension-package.js`의 Node script 스타일과 기존 주석 기준.

**Test scenarios:**

- Happy path: fake WXT output manifest와 healthy API가 있으면 readiness success message를 생성한다.
- Error path: API health가 timeout이면 API 미기동 메시지와 확인 대상 URL을 표시한다.
- Error path: WXT dev output manifest가 timeout이면 WXT output 경로와 extension dev process 상태를 표시한다.
- Integration: wrapper가 WXT child process 종료 코드를 root dev task에 전달한다.

**Verification:** root dev 실행 중 extension task 로그에서 API와 WXT readiness 상태를 확인할 수 있어야 한다.

### U3. Parameterize Browser Smoke For Dev Output

**Goal:** 기존 browser smoke를 production output 전용으로 유지하되, dev output을 빠르게 검증할 수 있는 재사용 가능한 경계를 만든다.

**Requirements:** R2, R4, R5

**Dependencies:** U2

**Files:**

- Modify: `apps/chrome-extension/tests/browser/popup-smoke.mjs`
- Create or modify: `apps/chrome-extension/tests/browser/`
- Modify: `apps/chrome-extension/package.json`

**Approach:** smoke core가 output root와 mode를 입력으로 받을 수 있게 분리한다. production mode는 기존처럼 build 후 `.output/chrome-mv3`를 검증하고, dev mode는 이미 실행 중인 WXT dev output `.output/chrome-mv3-dev`를 대상으로 load-unpacked 렌더링만 빠르게 확인한다.

**Patterns to follow:** 기존 `popup-smoke.mjs`의 실제 API health 확인, fake API server, static output server 구성.

**Test scenarios:**

- Happy path: production mode는 `.output/chrome-mv3`를 대상으로 기존 supported, unsupported, server unavailable, download flow를 유지한다.
- Happy path: dev mode는 `.output/chrome-mv3-dev` manifest가 있으면 popup 렌더링 smoke를 수행한다.
- Error path: 지정된 output root에 manifest가 없으면 mode별 안내 메시지를 표시한다.
- Integration: production `test:browser` 결과가 기존 출력 계약을 유지한다.

**Verification:** production smoke는 기존과 동일하게 통과하고, dev smoke는 `pnpm dev` 실행 중 별도로 빠르게 돌릴 수 있어야 한다.

### U4. Wire Root Developer Commands And Documentation

**Goal:** 개발자가 root에서 어떤 명령으로 즉시 테스트하는지 명확한 UX를 제공한다.

**Requirements:** R1, R2, R3, R4

**Dependencies:** U2, U3

**Files:**

- Modify: `package.json`
- Modify: `apps/chrome-extension/package.json`
- Modify: `README.md`
- Test: package script behavior through existing build/test scripts

**Approach:** root `pnpm dev`는 long-running dev entrypoint로 유지한다. 필요한 경우 root 또는 extension package에 dev smoke 전용 script를 추가해, watch process가 켜진 상태에서 빠른 browser check를 실행할 수 있게 한다. README에는 "개발 중 즉시 확인"과 "production load-unpacked 검증"을 서로 다른 흐름으로 정리한다.

**Patterns to follow:** root script는 Turbo orchestration만 담당한다는 기존 monorepo 패턴.

**Test scenarios:**

- Happy path: root dev task가 API와 extension dev task를 계속 실행한다.
- Happy path: dev smoke script가 실행 중인 dev output을 대상으로 popup load를 확인한다.
- Error path: dev smoke를 dev server 없이 실행하면 production build를 암묵적으로 만들지 않고 dev server 필요 메시지를 표시한다.

**Verification:** 새 문서와 script 이름만 보고도 `pnpm dev` 후 바로 어디서 popup을 테스트할지 알 수 있어야 한다.

---

## Risk Analysis & Mitigation

| Risk | Mitigation |
| --- | --- |
| WXT dev output path가 버전에 따라 달라짐 | wrapper에서 output root를 상수화하고 실패 메시지에 실제 확인 경로를 노출한다. |
| `pnpm dev`가 readiness probe 때문에 종료됨 | probe 실패는 WXT process를 죽이지 않고 actionable warning으로 다룬다. |
| production smoke와 dev smoke가 섞임 | script 이름과 mode를 분리하고 `test:browser`는 production behavior를 유지한다. |
| Playwright가 dev process와 중복 Chrome을 띄움 | 자동 full smoke는 기본 dev startup에서 제외하고, 빠른 readiness와 수동 테스트 안내를 기본값으로 둔다. |

---

## Verification Strategy

- Unit-level script tests cover readiness success and failure messages.
- Existing extension package tests continue to cover URL generation and popup state transitions.
- Existing production browser smoke continues to validate `.output/chrome-mv3`.
- Dev smoke validates `.output/chrome-mv3-dev` only when WXT dev server is already running.

---

## Deferred Implementation Notes

- WXT CLI option이나 runner 설정으로 start URL을 안정적으로 지정할 수 있는지는 구현 중 현재 WXT 버전에서 확인한다.
- Readiness wrapper의 timeout 기본값은 개발 머신에서 너무 공격적이지 않게 잡고, 환경 변수로 override 가능하게 할지 구현 중 판단한다.
- dev smoke를 root script로 둘지 extension package script로만 둘지는 root script의 단순성 원칙을 기준으로 최종 결정한다.
