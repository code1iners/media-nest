---
title: pnpm Turborepo Monorepo Migration Plan
type: migration
status: planned
date: 2026-06-18
---

# pnpm Turborepo Monorepo Migration Plan

## Summary

`media-nest`를 pnpm + Turborepo 기반 모노레포 루트로 전환하고, 별도 저장소인 `media-chrome-extension`의 현재 파일 상태를 Git 히스토리 없이 `apps/chrome-extension`으로 이관한다. API 서버는 `apps/api`로 이동하되 기존 `/audio`, `/video`, `/health` 계약과 Docker 런타임 검증 흐름을 유지한다.

이번 계획은 모노레포 구조와 툴링 전환까지를 다룬다. Chrome 확장 프로그램의 현재 깨진 참조 수정과 API 호출 UI 구현은 후속 작업으로 분리한다.

## Confirmed Decisions

- pnpm 전환은 모노레포 전환과 같은 작업 범위에 포함한다.
- `media-chrome-extension`은 기존 Git 히스토리를 보존하지 않고 현재 파일 상태만 이관한다.
- `media-chrome-extension`의 `manifest.json` content script 경로와 popup asset 상대 경로 문제는 이번 이관에서 고치지 않는다.
- 서버 전용 미디어 다운로드 core는 공유 패키지로 분리하지 않고 `apps/api/src/media` 내부 deep module로 유지한다.
- Day 1에는 `packages/media-api-contract`, `packages/ui`, `packages/downloader-core`를 만들지 않는다.

## Current Context

### API Repository

- 현재 루트 `package.json`은 단일 NestJS 앱 기준이며 `npm` scripts, Jest 설정, Nest build 설정을 포함한다.
- `Dockerfile`은 `package*.json`, `npm ci`, `npm run build`, `npm prune --omit=dev`를 전제로 한다.
- `README.md`와 운영 문서는 `npm` 명령 기준이다.
- `docs/api/current-implementation-fsd.md` 기준 API 계약은 `/audio`, `/video`, `/health`다.
- `src/media`는 다운로드 lifecycle, downloader adapter, HTTP delivery boundary를 이미 가진 서버 전용 deep module이다.

### Chrome Extension Repository

- 현재 `package.json`이 없어 workspace package로 바로 인식되지 않는다.
- `manifest.json`은 존재하지 않는 `index.js`를 content script로 참조한다.
- `popup/popup.html`은 현재 파일 배치 기준으로 CSS/JS 상대 경로가 맞지 않는다.
- 이번 작업에서는 위 문제를 수정하지 않고 알려진 후속 이슈로 기록한다.

## Target Structure

```text
media-nest/
  apps/
    api/
      package.json
      src/
      test/
      scripts/
      tsconfig.json
      tsconfig.build.json
      nest-cli.json
    chrome-extension/
      package.json
      manifest.json
      popup/
      scripts/
      styles/
      images/
  docs/
  package.json
  pnpm-workspace.yaml
  pnpm-lock.yaml
  turbo.json
  Dockerfile
  docker-compose.yml
```

## Package Boundaries

### `apps/api`

`apps/api`는 현재 NestJS API 서버 전체를 소유한다. `audio`와 `video`는 format selector와 MIME/확장자 선택을 담당하고, 다운로드 lifecycle과 임시 파일 cleanup은 `src/media` 내부에 남긴다.

앱 외부로 노출할 계약은 HTTP API뿐이다. `apps/chrome-extension`이나 향후 `apps/web`이 `apps/api/src/*`를 직접 import하면 안 된다.

### `apps/chrome-extension`

`apps/chrome-extension`은 현재 Chrome 확장 프로그램 파일을 소유한다. 초기 이관 목표는 "모노레포 안에서 추적되는 소스"이며, "즉시 동작하는 확장 프로그램"이 아니다.

Turborepo package graph에 포함하기 위해 최소 `package.json`을 둔다. 빌드 스크립트는 현재 정적 파일 상태를 그대로 확인하거나 no-op으로 시작할 수 있다.

### `packages/*`

초기에는 공용 런타임 패키지를 만들지 않는다.

후속 후보:

- `packages/media-api-contract`: 확장 또는 웹 UI가 실제로 API를 호출하기 시작한 뒤 endpoint path, query schema, typed client를 공유할 필요가 생기면 만든다.
- `packages/tsconfig`: 앱이 TypeScript 설정을 공유할 필요가 생기면 만든다.
- `packages/eslint-config`: JS 확장 앱과 TS API 앱의 lint 기준을 통합할 필요가 생기면 만든다.

보류:

- `packages/downloader-core`: 현재 downloader core는 Node, ffmpeg, temp directory, Nest ConfigService에 묶여 있어 브라우저 앱과 공유할 수 없다.
- `packages/ui`: 확장 UI와 웹 UI가 실제로 같은 컴포넌트를 공유하기 전까지 만들지 않는다.

## Implementation Units

### U1. Prepare Workspace Root

**Goal:** 기존 `media-nest` 루트를 모노레포 root로 전환한다.

**Files:**

- Modify: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `pnpm-lock.yaml`
- Delete: `package-lock.json`

**Approach:**

- root `package.json`은 workspace root 역할만 맡긴다.
- `packageManager`를 현재 로컬 pnpm 기준으로 명시한다.
- root scripts는 `turbo run build`, `turbo run test`, `turbo run lint`처럼 workspace orchestration만 담당한다.
- `turbo.json`에는 `build`, `test`, `lint`, `dev`, `verify:runtime` task를 정의한다.

**Verification:**

- `pnpm install`
- `pnpm turbo --version`
- `pnpm turbo run build --dry=json`

### U2. Move API App Into `apps/api`

**Goal:** 현재 NestJS API 서버를 앱 패키지로 이동하되 API 계약과 테스트 표면을 유지한다.

**Files:**

- Move: `src/` -> `apps/api/src/`
- Move: `test/` -> `apps/api/test/`
- Move: `scripts/` -> `apps/api/scripts/`
- Move: `tsconfig.json` -> `apps/api/tsconfig.json`
- Move: `tsconfig.build.json` -> `apps/api/tsconfig.build.json`
- Move: `nest-cli.json` -> `apps/api/nest-cli.json`
- Move app dependencies/scripts from root `package.json` -> `apps/api/package.json`

**Approach:**

- 앱 package name은 `api` 또는 `@media-nest/api` 중 하나로 정하되, turbo filter가 간단한 `api`를 기본값으로 둔다.
- Jest 설정은 `apps/api` 기준 경로로 유지한다.
- `coverage` 출력이 root와 app 중 어디에 생길지 명확히 정하고 `.gitignore`와 turbo outputs를 맞춘다.
- `src/media` 내부 구조는 건드리지 않는다.

**Verification:**

- `pnpm --filter api run lint`
- `pnpm --filter api run test`
- `pnpm --filter api run test:e2e`
- `pnpm --filter api run build`

### U3. Convert Docker And Compose To Workspace Layout

**Goal:** pnpm workspace 구조에서도 API Docker image와 runtime verification이 유지되게 한다.

**Files:**

- Modify: `Dockerfile`
- Modify: `docker-compose.yml` if needed
- Modify: `.dockerignore`
- Modify: `README.md`

**Approach:**

- Docker build stage에서 Corepack으로 pnpm을 활성화한다.
- install layer는 root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `apps/api/package.json`을 먼저 복사해 캐시가 유지되게 한다.
- build는 `pnpm --filter api run build` 기준으로 수행한다.
- production image에는 API 실행에 필요한 workspace 산출물과 production dependencies만 포함한다.
- `scripts/verify-runtime-dependencies.sh`는 `apps/api/scripts` 기준으로 복사하거나 실행 경로를 명확히 맞춘다.

**Verification:**

- `docker compose build`
- `docker compose up -d`
- `curl http://127.0.0.1:3030/health`
- `docker compose run --rm media-nest pnpm --filter api run verify:runtime`

### U4. Import Chrome Extension As Current Source Snapshot

**Goal:** `media-chrome-extension`의 현재 파일 상태를 Git 히스토리 없이 `apps/chrome-extension`에 이관한다.

**Files:**

- Create: `apps/chrome-extension/package.json`
- Copy: `manifest.json`
- Copy: `background.js`
- Copy: `popup/`
- Copy: `scripts/`
- Copy: `styles/`
- Copy: `images/`

**Approach:**

- `.git`, `.DS_Store`는 이관하지 않는다.
- 기존 tracked 삭제 상태나 old path는 보존하지 않고 현재 working tree 파일만 복사한다.
- `manifest.json`의 missing `index.js` 참조와 popup asset 경로 문제는 수정하지 않는다.
- 단, 후속 이슈로 명시해 이후 작업에서 놓치지 않게 한다.

**Verification:**

- `pnpm turbo run build --filter=chrome-extension` if build script exists
- `find apps/chrome-extension -maxdepth 3 -type f`
- 알려진 broken reference가 변경되지 않았는지 diff로 확인

### U5. Update Documentation

**Goal:** 개발자와 운영자가 pnpm workspace 기준으로 실행할 수 있게 문서를 맞춘다.

**Files:**

- Modify: `README.md`
- Modify: `docs/api/current-implementation-prd.md` if product scope wording changes
- Modify: `docs/api/current-implementation-fsd.md` if runtime/tooling wording changes
- Create or update: follow-up plan for Chrome extension path fixes

**Approach:**

- `npm install`, `npm run ...` 명령을 `pnpm install`, `pnpm --filter api run ...`, `pnpm turbo run ...`로 교체한다.
- Docker 운영 명령은 유지하되 컨테이너 내부 검증 명령을 pnpm 기준으로 수정한다.
- Chrome 확장 프로그램은 "소스 이관됨, 동작 수정은 후속"이라고 명확히 적는다.

**Verification:**

- 문서 명령과 실제 package scripts가 일치하는지 확인한다.
- `rg "npm "`로 남은 npm 명령이 의도된 과거 설명인지 확인한다.

### U6. Final Verification And Review

**Goal:** 모노레포 전환이 API 동작, Docker 운영, workspace task graph를 깨지 않았는지 확인한다.

**Commands:**

```bash
pnpm install
pnpm turbo run lint
pnpm turbo run test
pnpm turbo run build
pnpm --filter api run test:e2e
pnpm --filter api run verify:runtime
docker compose build
docker compose up -d
curl http://127.0.0.1:3030/health
docker compose down
```

**Review Focus:**

- `apps/chrome-extension`이 `apps/api/src/*`를 직접 import하지 않는다.
- `apps/api/src/media` 책임이 브라우저 쪽으로 새지 않는다.
- Docker image가 Node 22, yt-dlp, ffmpeg runtime pinning을 계속 보장한다.
- Turborepo cache outputs가 `dist`와 `coverage`를 의도대로 다룬다.
- `package-lock.json`이 제거되고 `pnpm-lock.yaml`만 남는다.

## Known Follow-Up Work

- Chrome extension `manifest.json`의 content script 경로를 실제 파일에 맞게 고친다.
- `popup/popup.html`의 CSS/JS 상대 경로를 현재 파일 배치에 맞게 고친다.
- 확장 popup에서 현재 YouTube tab URL 또는 video ID를 추출한다.
- 확장 popup에서 API base URL을 설정하고 `/audio`, `/video` 다운로드를 호출한다.
- 실제 API 호출 코드가 생긴 뒤 `packages/media-api-contract` 도입 여부를 다시 판단한다.
- Chrome extension origin 검증과 API CORS allowlist 정책을 별도 계획으로 다룬다.

## Acceptance Criteria

- root에서 pnpm workspace install이 성공한다.
- root에서 turbo task graph가 API와 Chrome extension package를 인식한다.
- `apps/api`의 기존 unit/e2e/build/lint/runtime verification이 통과한다.
- Docker compose로 API 서버가 빌드되고 `/health`가 응답한다.
- `apps/chrome-extension`에는 현재 확장 파일 상태가 Git 히스토리 없이 이관되어 있다.
- 이번 작업에서 extension broken reference를 고치지 않았다는 점이 문서화되어 있다.
- API와 extension 사이의 공유는 HTTP 계약 수준에 머물고, 서버 전용 downloader core가 client package로 이동하지 않는다.

## Subagent Findings Applied

- `architect-reviewer`: API의 `src/media`는 서버 전용 deep module로 유지하고, 확장과 공유하지 않는 것이 적절하다고 판단했다.
- `architect-reviewer`: `packages/media-api-contract`는 확장이 실제 API 호출 코드를 갖기 전까지 보류하는 것이 적절하다고 판단했다.
- `build-engineer`: Dockerfile의 `npm ci`, `npm run build`, `npm prune --omit=dev` 전환이 가장 큰 tooling risk라고 판단했다.
- `build-engineer`: 확장은 package graph 인식을 위해 최소 `package.json`을 두되, 현재 broken reference는 별도 후속 이슈로 관리하는 것이 적절하다고 판단했다.
