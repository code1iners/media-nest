---
title: fix: CORS allowlist를 실제 클라이언트 origin에 맞춘다
type: fix
status: implemented
date: 2026-06-22
---

# fix: CORS allowlist를 실제 클라이언트 origin에 맞춘다

## Summary

API의 permissive CORS 설정을 실제 호출 표면 기준 allowlist로 되돌린다. 현재 구현은 no-origin 요청, 운영 web origin, local preview/dev origin만 허용하고 `Content-Disposition`, `Content-Type` expose를 유지한다.

고정 extension ID를 모르는 상태이므로 `chrome-extension://<id>` origin 허용은 이번 구현에서 제외한다.

---

## Problem Frame

이전 `EXTENSION_ID` 기반 allowlist 시도는 Chrome extension 호출에서 CORS 오류가 나서 전체 허용으로 되돌려졌다. 이번 구현은 같은 회귀를 막기 위해 no-origin 요청을 허용하고, origin 판정 로직을 테스트 가능한 helper로 분리한다.

---

## Requirements

- R1. API는 `Origin`이 없는 요청을 허용해야 한다. 현재 load-unpacked extension popup의 `/health` fetch와 `chrome.downloads.download` 요청은 실측상 no-origin이다.
- R2. API는 운영 web origin `https://mytube-extract-web.codeliners.cc`를 허용해야 한다.
- R3. API는 local 개발용 `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:5173`, `http://127.0.0.1:5173`를 개발 환경에서 허용해야 한다.
- R4. API는 임의 외부 web origin을 거부해야 한다.
- R5. `Content-Disposition`, `Content-Type` expose는 유지해야 한다.
- R6. Chrome extension `host_permissions`와 API CORS allowlist가 서로 다른 책임이라는 점을 문서화해야 한다.
- R7. 고정 extension ID를 모르는 상태이므로 `chrome-extension://{id}` origin 허용은 제외해야 한다.

---

## Scope Boundaries

- API 인증, rate limit, reverse proxy 정책은 추가하지 않는다.
- YouTube-only source policy는 바꾸지 않는다.
- Chrome Web Store 배포 자동화는 포함하지 않는다.
- 다운로드 도중 취소 기능은 구현하지 않는다.
- 고정 extension ID 기반 `chrome-extension://...` origin 허용은 포함하지 않는다.

### Deferred to Follow-Up Work

- 다운로드 도중 취소 기능: `docs/unimplemented/current-unimplemented.md`에 잔여 과제로 기록한다.
- 공개 운영 보안 하드닝: CORS는 browser read barrier일 뿐이므로 인증/rate limit은 별도 계획으로 다룬다.

---

## Context & Research

### Relevant Code and Patterns

- `apps/api/src/main.ts`는 `createCorsOptions()`를 사용한다.
- `apps/api/src/cors-options.ts`는 no-origin, 운영 web origin, local preview/dev origin 판정을 소유한다.
- `apps/chrome-extension/src/services/mytube-extract/mytube-extract-client.ts`는 popup submit 전 `/health`를 `fetch`한다.
- `apps/chrome-extension/src/adapters/chrome/downloads.ts`는 실제 media 다운로드를 `chrome.downloads.download`로 시작한다.
- `apps/chrome-extension/wxt.config.ts`는 API origin을 `host_permissions`로 생성한다.
- `apps/web/src/app/app.tsx`는 API attachment를 `fetch`하고 `Content-Disposition`을 읽는다.
- `apps/web/vite.config.ts`는 local web dev port를 `5173`으로 고정한다.
- `apps/chrome-extension/tools/run-wxt-dev-ready.js`는 localhost popup preview를 기본 `3000` 포트로 연다.

### Institutional Learnings

- `docs/api/current-implementation-fsd.md`는 CORS 제한을 Chrome extension 실제 origin 검증 뒤 재개한다고 기록한다.
- `docs/plans/2026-06-22-001-fix-web-download-api-call-plan.md`는 web fetch가 attachment metadata를 읽기 위해 exposed headers가 필요하다고 기록한다.

### External References

- Chrome extension network requests: `https://developer.chrome.com/docs/extensions/develop/concepts/network-requests`
- Chrome extension permissions and host permissions: `https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions`
- Chrome webRequest scheme notes: `https://developer.chrome.com/docs/extensions/reference/api/webRequest`
- NestJS CORS: `https://docs.nestjs.com/security/cors`
- Express cors middleware: `https://expressjs.com/en/resources/middleware/cors/`

---

## Key Technical Decisions

- CORS origin 판정은 `main.ts` 밖의 작은 helper로 분리한다. `main.ts` bootstrap side effect 없이 unit test와 e2e에서 같은 정책을 재사용하기 위해서다.
- Production에서는 운영 web origin만 허용한다. 개발용 localhost origin은 development/test 환경에서만 허용한다.
- no-origin 요청은 허용한다. 실제 extension/download 경로와 curl/direct download를 깨뜨리지 않기 위해서다.
- 고정 extension ID를 모르는 상태이므로 `chrome-extension://{id}`와 `extension://{id}`는 모두 허용하지 않는다.
- CORS denial은 throw 기반 callback보다 `callback(null, false)` 형태를 우선 검토한다. 임의 origin을 서버 500처럼 보이게 만들지 않고 browser CORS denial로 남기는 편이 진단에 낫다.

---

## Open Questions

### Resolved During Planning

- 운영 web origin은 무엇인가? `https://mytube-extract-web.codeliners.cc`다.
- 현재 extension popup fetch의 `Origin`은 무엇인가? load-unpacked 실측에서는 `/health`, `/audio` 모두 no-origin이었다.
- `Content-Disposition` expose를 제거해도 되는가? 아니다. web 앱이 API filename을 읽는다.

### Deferred

- production 배포 환경의 `NODE_ENV` 값: 구현 중 실제 compose/deploy env와 맞는지 확인하고 문서에 반영한다.
- Chrome Web Store 배포 후 고정 extension ID 기반 origin 허용을 검토한다.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

| Request origin | Environment | Expected decision |
| --- | --- | --- |
| none | any | allow |
| `https://mytube-extract-web.codeliners.cc` | production/development/test | allow |
| `http://localhost:3000` | development/test | allow |
| `http://127.0.0.1:3000` | development/test | allow |
| `http://localhost:5173` | development/test | allow |
| `http://127.0.0.1:5173` | development/test | allow |
| `chrome-extension://{id}` | any | deny until fixed extension ID is known |
| other origin | any | deny |

---

## Implementation Units

### U1. CORS origin policy helper

**Goal:** CORS 허용/거부 결정을 테스트 가능한 작은 helper로 분리한다.

**Requirements:** R1, R2, R3, R4, R5, R7

**Dependencies:** None

**Files:**
- Create: `apps/api/src/cors-options.ts`
- Test: `apps/api/src/cors-options.spec.ts`

**Approach:**
- 환경값 입력을 받아 allowed origin set과 CORS options를 만든다.
- no-origin은 허용한다.
- `NODE_ENV`가 production이면 local dev origin을 제외한다.
- extension ID 기반 origin은 이번 범위에서 추가하지 않는다.
- exposed headers는 현재 값인 `Content-Disposition`, `Content-Type`을 유지한다.

**Execution note:** Test-first. 과거 회귀가 origin 판정에서 났으므로 helper test를 먼저 둔다.

**Patterns to follow:**
- `apps/api/src/media/*spec.ts`의 작은 unit test 스타일.
- `apps/api/src/main.ts`의 현재 exposed header 값.

**Test scenarios:**
- Happy path: no-origin 입력은 allowed로 판정된다.
- Happy path: `https://mytube-extract-web.codeliners.cc`는 production에서도 allowed다.
- Edge case: development/test에서는 `localhost:3000`, `127.0.0.1:3000`, `localhost:5173`, `127.0.0.1:5173`가 allowed다.
- Error path: production에서는 local dev origin이 denied다.
- Error path: `https://evil.example`은 denied다.
- Regression: `chrome-extension://abc`와 `extension://abc`는 denied다.

**Verification:**
- CORS helper가 요구 origin matrix를 통과한다.

---

### U2. API bootstrap wiring

**Goal:** `main.ts`가 permissive CORS 대신 U1의 allowlist options를 사용하게 한다.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** U1

**Files:**
- Modify: `apps/api/src/main.ts`
- Test: `apps/api/test/app.e2e-spec.ts` 또는 `apps/api/test/cors.e2e-spec.ts`

**Approach:**
- `app.enableCors()` 호출을 U1 helper 기반 options로 교체한다.
- 주석 처리된 old allowlist는 제거한다.
- e2e에서는 same CORS options를 켠 Nest app에 `Origin` header를 보내 response header를 확인한다.

**Patterns to follow:**
- 기존 `apps/api/test/app.e2e-spec.ts`의 Nest app bootstrap 방식.
- `docs/plans/2026-06-22-001-fix-web-download-api-call-plan.md`에서 요구한 exposed headers 유지.

**Test scenarios:**
- Integration: `Origin: https://mytube-extract-web.codeliners.cc` 요청은 `Access-Control-Allow-Origin`이 해당 origin으로 응답된다.
- Integration: no-origin 요청은 거부되지 않는다.
- Integration: denied origin 요청은 allow-origin header를 받지 못한다.
- Integration: allowed origin 응답은 `Access-Control-Expose-Headers`에 `Content-Disposition`, `Content-Type`을 포함한다.
- Error path: old `http://localhost:5959`가 필요 origin으로 남지 않았음을 테스트 또는 문서에서 확인한다.

**Verification:**
- API e2e가 origin allow/deny와 exposed header를 실제 HTTP response 기준으로 증명한다.

---

### U3. Browser regression probes

**Goal:** unit/e2e가 놓칠 수 있는 실제 browser CORS 경로를 최소 smoke로 확인한다.

**Requirements:** R1, R2, R3, R6, R7

**Dependencies:** U1, U2

**Files:**
- Modify: `apps/chrome-extension/tests/browser/popup-smoke.mjs`
- Test: `apps/chrome-extension/tests/browser/popup-smoke.mjs`

**Approach:**
- 기존 browser smoke가 fake page + `Access-Control-Allow-Origin: *`에 의존해 real extension CORS를 놓치는 점을 보완한다.
- load-unpacked extension popup에서 local API `/health`를 통과하는 경로를 확인한다.
- web dev origin `5173`은 U2 HTTP e2e에서 CORS response header로 증명하고, 실제 web UI 저장 동작은 필요할 때 U4 문서의 수동 검증으로 남긴다.

**Patterns to follow:**
- `apps/chrome-extension/tests/browser/popup-smoke.mjs`의 load-unpacked extension ID 읽기.
- `apps/web/src/app/app.tsx`의 fetch + filename resolution 흐름.

**Test scenarios:**
- Integration: local API base로 build한 load-unpacked popup submit이 `/health`를 통과하고 다운로드 시작 상태가 된다.
- Integration: captured request에서 extension-origin 요청이 no-origin이어도 allowlist가 실패하지 않는다.

**Verification:**
- 실제 Chromium 기반 검증이 과거 CORS 오류 재발 가능성을 차단한다.

---

### U4. Documentation and operations alignment

**Goal:** 문서의 CORS 보류 상태를 구현된 allowlist 정책으로 갱신하고 운영 env 책임을 명확히 한다.

**Requirements:** R2, R4, R6, R7

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `README.md`
- Modify: `docs/api/current-implementation-prd.md`
- Modify: `docs/api/current-implementation-fsd.md`
- Modify: `docs/chrome-extension/current-implementation-prd.md`
- Modify: `docs/chrome-extension/current-implementation-fsd.md`

**Approach:**
- "전체 허용" 문구를 새 allowlist 정책으로 교체한다.
- 운영 web origin `https://mytube-extract-web.codeliners.cc`를 명시한다.
- 고정 extension ID 기반 origin 허용은 이번 범위에서 제외했음을 명시한다.
- `host_permissions`는 client-side permission이고 API CORS allowlist와 별도 축임을 문서화한다.

**Patterns to follow:**
- 현재 README의 짧은 운영 중심 설명.
- 현재 PRD/FSD의 "현재 상태 + 후속 보류" 문체.

**Test scenarios:**
- Test expectation: none -- 문서 변경이다. U1-U3 검증이 동작을 증명한다.

**Verification:**
- CORS 관련 문서가 permissive 상태와 보류 상태를 더 이상 현재 구현처럼 설명하지 않는다.

---

## System-Wide Impact

- **Interaction graph:** API bootstrap, extension popup health fetch, Chrome downloads, web fetch download flow가 함께 영향받는다.
- **Error propagation:** denied browser origin은 API app crash나 generic 500이 아니라 browser CORS denial로 남아야 한다.
- **State lifecycle risks:** CORS 변경 자체는 다운로드 작업 lifecycle을 바꾸지 않지만, web fetch와 extension health check가 더 빨리 실패할 수 있다.
- **API surface parity:** `/health`, `/audio`, `/video` 모두 같은 CORS policy를 통과해야 한다.
- **Integration coverage:** helper unit test만으로는 부족하다. HTTP response header와 실제 Chromium smoke가 필요하다.
- **Unchanged invariants:** 다운로드 endpoint 계약, source URL policy, media generation, `Content-Disposition` attachment header는 바꾸지 않는다.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 실제 production `NODE_ENV`가 예상과 다르면 local origin 허용/차단이 어긋남 | U4에서 운영 env 문서화, U2 테스트에서 env별 matrix 고정 |
| Chrome extension 요청이 origin을 보내면 거부될 수 있음 | 현재 실측한 no-origin 요청은 허용하고, 고정 extension ID 확인 뒤 별도 허용을 검토 |
| web prod origin 누락으로 운영 web이 깨짐 | R2와 U1 테스트에 `https://mytube-extract-web.codeliners.cc` 고정 |
| browser smoke가 느려짐 | U3는 real CORS를 검증하는 최소 1개 경로만 추가 |
| CORS를 보안 경계로 과신함 | Scope Boundaries와 docs에서 인증/rate limit은 별도 보안 작업으로 분리 |

---

## Documentation / Operational Notes

- `.env.example`에는 현재 API가 사용하지 않는 `EXTENSION_ID`를 두지 않는다.
- README CORS 섹션은 allowlist 정책과 운영 web origin을 설명한다.
- 다운로드 도중 취소 기능은 `docs/unimplemented/current-unimplemented.md`에 잔여 과제로 남긴다.

---

## Sources & References

- Related code: `apps/api/src/main.ts`
- Related code: `apps/chrome-extension/src/services/mytube-extract/mytube-extract-client.ts`
- Related code: `apps/chrome-extension/src/adapters/chrome/downloads.ts`
- Related code: `apps/chrome-extension/wxt.config.ts`
- Related code: `apps/web/src/app/app.tsx`
- Related code: `apps/web/vite.config.ts`
- Related docs: `docs/unimplemented/current-unimplemented.md`
- External docs: `https://developer.chrome.com/docs/extensions/develop/concepts/network-requests`
- External docs: `https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions`
- External docs: `https://developer.chrome.com/docs/extensions/reference/api/webRequest`
- External docs: `https://docs.nestjs.com/security/cors`
- External docs: `https://expressjs.com/en/resources/middleware/cors/`
