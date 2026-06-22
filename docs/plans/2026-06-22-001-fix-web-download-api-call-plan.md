---
title: fix: 웹 다운로드를 API fetch 호출로 전환
type: fix
status: completed
date: 2026-06-22
---

# fix: 웹 다운로드를 API fetch 호출로 전환

## Summary

현재 web 앱은 생성한 Media Nest 다운로드 URL을 새 탭으로 연다. 이 계획은 web submit 흐름을 기존 다운로드 API `fetch` 호출로 바꾸고, attachment 응답을 blob으로 받아 같은 페이지에서 브라우저 파일 저장을 시작하게 한다.

## Requirements

- R1. web submit은 새 탭을 열지 않고 기존 Media Nest 다운로드 API를 호출해야 한다.
- R2. 오디오/비디오 모드는 기존 `/audio?url=...`, `/video?url=...` API 계약을 그대로 사용해야 한다.
- R3. API 성공 응답은 브라우저 파일 다운로드로 이어져야 한다.
- R4. API 실패 응답은 사용자를 현재 페이지에 남기고 재시도 가능한 실패 상태를 보여줘야 한다.
- R5. 새 API endpoint나 새 frontend dependency를 추가하지 않아야 한다.

## Scope Boundaries

- 서버 다운로드 생성 계약은 바꾸지 않는다.
- Chrome extension 동작은 바꾸지 않는다.
- background job, polling flow, persistent download history는 추가하지 않는다.
- 이 작은 web 흐름만을 위해 component test framework를 추가하지 않는다.

## Context & Research

### Relevant Code and Patterns

- `apps/web/src/app/app.tsx`는 현재 다운로드 URL을 만들고 `generatedUrl`에 저장한 뒤 `window.open`을 호출한다.
- `apps/web/src/domain/download-request/download-request.ts`는 form 입력 검증과 올바른 API URL 생성을 이미 담당한다.
- `apps/api/src/audio/audio.controller.ts`, `apps/api/src/video/video.controller.ts`는 이미 `GET /audio`, `GET /video` attachment 응답을 제공한다.
- `apps/api/src/media/http-media-delivery.ts`는 `sendFile` 전에 `Content-Type`, `Content-Disposition`을 설정한다.
- `apps/api/src/main.ts`는 현재 CORS를 전역 허용하지만, browser JavaScript가 attachment header를 읽도록 노출하지는 않는다.

### Institutional Learnings

- 이 web 다운로드 변경과 정확히 맞는 `docs/solutions/` 또는 requirements 문서는 찾지 못했다.

## Key Technical Decisions

- 새 client API layer를 만들지 않고 `buildDownloadUrl`을 재사용한다. 이미 API 계약을 표현하고 있어 diff가 작다.
- browser-native `fetch`, `Blob`, `URL.createObjectURL`, 임시 anchor download를 사용한다. 새 dependency는 필요 없다.
- web 앱이 서버가 선택한 filename을 재사용할 수 있도록 API CORS config에서 `Content-Disposition`을 노출한다.
- header가 없거나 읽을 수 없는 경우를 위해 web 쪽 filename fallback을 유지한다.

## Open Questions

### Resolved During Planning

- API endpoint를 바꿔야 하는가? 아니다. 기존 `/audio`, `/video` URL query endpoint가 이미 attachment 응답을 생성한다.
- web에서 생성 URL link를 계속 보여줘야 하는가? primary flow에서는 아니다. 기존 "URL 열기" 동작을 강화한다.

### Deferred to Implementation

- 정확한 fallback filename 문구: 구현 중 현재 draft mode와 optional filename 기준으로 가장 작은 user-safe fallback을 선택한다.

## Implementation Units

### U1. Web 다운로드 실행 상태 추가

**Goal:** "URL 열기" submit 동작을 페이지 내부 다운로드 요청 상태로 바꾼다.

**Requirements:** R1, R3, R4

**Dependencies:** None

**Files:**
- Modify: `apps/web/src/app/app.tsx`

**Approach:**
- `window.open` 경로를 제거한다.
- pending download와 failure message를 위한 최소 state를 추가한다.
- submit 시 기존 API URL을 만들고, `fetch`를 호출하고, non-OK response를 실패로 처리하고, body를 blob으로 변환한 뒤 임시 object URL로 브라우저 다운로드를 시작한다.
- click 시도 후 object URL은 항상 revoke한다.
- 기존 validation 기반 submit disable을 유지하고, 다운로드 요청 pending 중에도 disable한다.

**Patterns to follow:**
- 현재 `apps/web/src/app/app.tsx` 스타일에 맞춰 주석은 짧고 의미 있게 유지한다.
- testable parsing이 필요하지 않으면 logic은 local에 둔다.

**Test scenarios:**
- Happy path: 유효한 audio draft를 한 번 submit하면 API response blob이 downloadable object URL로 변환되고 pending state가 해제된다.
- Error path: API가 non-OK response를 반환하면 object URL download가 시작되지 않고 재시도 가능한 error message가 표시된다.
- Edge case: 실패 후 사용자가 입력을 수정하면 stale failure/result state가 초기화된다.

**Verification:**
- Web UI가 더 이상 `window.open`을 호출하지 않는다.
- Button copy가 더 이상 `다운로드 열기`가 아니다.
- 브라우저 저장이 시작되는 동안 사용자는 페이지에 남는다.

### U2. API 응답에서 다운로드 파일명 결정

**Goal:** 가능한 경우 web 다운로드가 API attachment filename을 사용하고, 불가능하면 local fallback을 사용하게 한다.

**Requirements:** R3

**Dependencies:** U1

**Files:**
- Modify: `apps/web/src/domain/download-request/download-request.ts`
- Test: `apps/web/tests/unit/download-request.test.ts`

**Approach:**
- `Content-Disposition` header에서 filename을 추출하는 작은 pure helper를 추가한다.
- 현재 API header 형태인 `attachment; filename*=UTF-8''...`를 지원한다.
- user-provided filename + mode extension으로 fallback하고, user filename이 없으면 mode 기반 generic filename을 사용한다.

**Patterns to follow:**
- 기존 URL/filename validation helper처럼 parsing은 방어적이고 작게 유지한다.
- `apps/web/tests/unit/download-request.test.ts`의 기존 Vitest unit test 스타일을 따른다.

**Test scenarios:**
- Happy path: encoded `filename*` header가 decoded filename을 반환한다.
- Edge case: header가 없으면 mode 기반 filename으로 fallback한다.
- Edge case: malformed encoded header는 throw하지 않고 fallback한다.
- Happy path: user filename fallback은 audio에는 `.mp3`, video에는 `.mp4`를 붙인다.

**Verification:**
- DOM이나 새 test dependency 없이 unit test가 filename resolution을 검증한다.

### U3. Browser fetch용 attachment header 노출

**Goal:** web 앱이 cross-origin API attachment metadata를 읽을 수 있게 한다.

**Requirements:** R3, R5

**Dependencies:** None

**Files:**
- Modify: `apps/api/src/main.ts`

**Approach:**
- 현재 permissive CORS 동작은 유지한다.
- `Content-Disposition`, `Content-Type`에 대한 `exposedHeaders`만 추가한다.
- 이 변경에서 origin allowlist logic은 다시 도입하지 않는다.

**Patterns to follow:**
- `README.md`에 문서화된 기존 CORS posture를 유지한다.

**Test scenarios:**
- Test expectation: none -- Nest bootstrap CORS option은 작은 config 변경이고 현재 API test는 `main.ts`를 instantiate하지 않는다.

**Verification:**
- web origin에서 API를 호출할 때 browser fetch가 `response.headers.get('Content-Disposition')`을 읽을 수 있다.

## System-Wide Impact

- **Interaction graph:** Web form submit은 이제 `fetch`로 API를 호출한다. API는 동일한 attachment를 계속 생성하고 stream한다.
- **Error propagation:** API non-OK response는 실패한 새 탭 navigation 대신 web-visible failure state가 된다.
- **State lifecycle risks:** Object URL은 브라우저 다운로드 trigger 후 revoke해야 한다.
- **API surface parity:** 기존 `/audio`, `/video`, `/audio/:id`, `/video/:id` 동작은 그대로 유지한다.
- **Integration coverage:** 성공한 local API response가 web page에서 파일 저장을 시작하는지 manual browser check로 확인해야 한다.
- **Unchanged invariants:** Chrome extension은 계속 Chrome downloads adapter를 사용한다.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| flow가 user submit에서 분리되면 browser가 programmatic download를 막을 수 있음 | submit promise chain에서 임시 anchor click을 직접 trigger하고 flow를 단순하게 유지 |
| cross-origin에서 filename header를 읽을 수 없음 | CORS로 `Content-Disposition`을 노출하고 fallback filename logic 유지 |
| `fetch().blob()`이 response를 buffer하므로 큰 파일은 memory를 사용함 | web MVP에서는 수용. file size가 실제 문제가 되면 stream-based download를 follow-up으로 처리 |

## Documentation / Operational Notes

- 같은 UI 변경에서 user-facing button/result copy를 갱신한다.
- endpoint 계약은 그대로라 API 문서 변경은 필요 없다.

## Sources & References

- Related code: `apps/web/src/app/app.tsx`
- Related code: `apps/web/src/domain/download-request/download-request.ts`
- Related code: `apps/api/src/main.ts`
- Related code: `apps/api/src/media/http-media-delivery.ts`
- Related docs: `README.md`
