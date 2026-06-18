---
title: Docker Runtime Dependency Pinning Plan
type: refactor
status: completed
date: 2026-06-18
---

# Docker Runtime Dependency Pinning Plan

## Summary

Docker 런타임 의존성을 재현 가능하게 만들기 위해 Node 베이스 이미지, `yt-dlp` 바이너리, ffmpeg 설치 방식을 단계적으로 고정한다. 기존 NestJS API 동작은 유지하고, 빌드/실행 환경의 변동 가능성을 줄이는 데 집중한다.

---

## Problem Frame

현재 Dockerfile은 `node:22-slim`, `apt-get install ffmpeg`, `youtube-dl-exec`의 기본 postinstall 동작에 의존한다. 이 구조는 컨테이너 사용 자체는 가능하지만, 빌드 시점에 따라 Node patch 버전, Debian 패키지 버전, `yt-dlp` 바이너리 버전이 달라질 수 있다.

---

## Requirements

- R1. 컨테이너 안에서 Node.js 22 계열 런타임을 명시적으로 고정한다.
- R2. `youtube-dl-exec` npm 패키지뿐 아니라 실제 실행되는 `yt-dlp` 바이너리 버전도 고정한다.
- R3. ffmpeg 설치 경로는 기존 `FFMPEG_LOCATION=/usr/bin/ffmpeg` 계약을 유지한다.
- R4. Docker 빌드가 `youtube-dl-exec`의 Python 3.9+ 설치 조건 때문에 실패하지 않도록 한다.
- R5. README와 현재 구현 문서가 실제 Docker 고정 전략과 일치하도록 갱신한다.
- R6. 다운로드 API의 외부 계약은 변경하지 않는다.

---

## Scope Boundaries

- YouTube 다운로드 성공률 자체를 개선하지 않는다.
- CORS, 인증, 사용량 제한, 다운로드 실패 사유 세분화는 포함하지 않는다.
- API 응답 형식과 엔드포인트 경로는 변경하지 않는다.
- `youtube-dl-exec`를 다른 라이브러리로 교체하지 않는다.

### Deferred to Follow-Up Work

- 런타임 readiness 확장: ffmpeg, `yt-dlp`, 임시 디렉터리 쓰기 권한을 검사하는 별도 health/readiness 엔드포인트는 후속 작업으로 분리한다.
- Debian snapshot 기반의 완전 재현 빌드: 운영 요구가 “동일 시점 재빌드”를 넘어 “장기 bit-for-bit 재현”까지 올라가면 별도 계획으로 다룬다.

---

## Context & Research

### Relevant Code and Patterns

- `Dockerfile`: 현재 multi-stage build, `node:22-slim`, production stage ffmpeg 설치 구조.
- `pnpm-lock.yaml`: `youtube-dl-exec` npm 패키지가 `3.0.30`으로 잠겨 있음.
- `apps/api/src/audio/audio.service.ts`: `FFMPEG_LOCATION`을 `youtube-dl-exec`의 `ffmpegLocation`으로 전달.
- `apps/api/src/video/video.service.ts`: 비디오 병합에서도 같은 `FFMPEG_LOCATION` 계약 사용.
- `.env.example`: production 기준 `FFMPEG_LOCATION=/usr/bin/ffmpeg`.
- `README.md`: Docker 실행 방법과 런타임 요구사항 문서.
- `docs/api/current-implementation-fsd.md`, `docs/api/current-implementation-prd.md`: 현재 실행 환경과 한계 문서.

### External References

- Docker Node Official Image: `node:<version>-slim`은 Node 실행 최소 패키지 중심 이미지이며 추가 도구는 직접 설치해야 함.
- docker-library official node tags: Node 22 계열에는 patch 버전 및 Debian variant 태그가 제공됨.
- youtube-dl-exec README: 기본 설치 시 최신 `yt-dlp`를 내려받고, `YOUTUBE_DL_HOST`, `YOUTUBE_DL_SKIP_DOWNLOAD`, `YOUTUBE_DL_SKIP_PYTHON_CHECK`로 postinstall 동작을 조정할 수 있음.
- Dockerfile best practices: apt 설치는 `apt-get update`와 `apt-get install`을 같은 layer에서 수행하고, 필요하면 package version pinning으로 예기치 않은 변경을 줄일 수 있음.

---

## Key Technical Decisions

- Node 베이스 이미지는 floating major tag보다 patch-level Debian slim tag를 우선 사용한다: `node:22-slim`은 시간이 지나며 대상 이미지가 바뀔 수 있으므로 R1을 충분히 만족하지 못한다.
- `yt-dlp`는 `youtube-dl-exec` 기본 최신 릴리스 다운로드에 맡기지 않고, 특정 release asset URL을 `YOUTUBE_DL_HOST`로 지정한다: npm lock만으로는 실제 바이너리 버전이 고정되지 않기 때문이다.
- build stage에는 Python 3.9+ 조건을 명시적으로 충족시키는 방향을 우선한다: 설치 검사를 우회하는 env보다 패키지 요구사항을 충족하는 쪽이 실패 원인을 줄인다.
- ffmpeg는 1차로 Debian variant와 설치 경로를 고정하고, package version pinning은 현재 Debian 저장소에서 사용 가능한 버전을 확인한 뒤 적용한다: 버전 문자열은 배포판/아키텍처별로 달라질 수 있어 구현 시점 확인이 필요하다.

---

## Open Questions

### Resolved During Planning

- Docker 컨테이너로 고정 가능한가: 가능하다. 다만 현재 구조는 Node tag, apt ffmpeg, `yt-dlp` latest 다운로드 때문에 완전 고정은 아니다.
- `FFMPEG_LOCATION` 계약을 바꿔야 하는가: 바꾸지 않는다. production 컨테이너 기준 `/usr/bin/ffmpeg`를 유지한다.

### Deferred to Implementation

- 사용할 정확한 Node 22 patch tag: 구현 시점의 official node tag 중 현재 운영 기준에 맞는 patch-level tag를 확인해 선택한다.
- 사용할 정확한 ffmpeg package version: 선택한 Debian variant에서 `apt-cache policy ffmpeg`로 확인한 뒤 pinning 가능 여부를 결정한다.
- 사용할 정확한 `yt-dlp` 버전: 현재 로컬 설치 버전 또는 구현 시점의 검증된 release 중 하나를 선택하고 문서에 명시한다.

---

## Implementation Units

### U1. Pin Node Base Image and Build Prerequisites

**Goal:** Docker build/production stage의 Node 런타임과 `youtube-dl-exec` 설치 전제 조건을 명시한다.

**Requirements:** R1, R4, R6

**Dependencies:** None

**Files:**
- Modify: `Dockerfile`
- Test: Docker image build verification

**Approach:**
- build/production stage 모두 patch-level Node 22 Debian slim tag로 맞춘다.
- build stage에서 `pnpm install --frozen-lockfile` 전에 `python3`와 필요한 인증서 패키지를 설치한다.
- production stage는 런타임에 필요한 패키지만 유지한다.

**Patterns to follow:**
- 기존 multi-stage Dockerfile 구조.
- 기존 `USER node`, `HEALTHCHECK`, `CMD ["node", "dist/main"]` 흐름.

**Test scenarios:**
- Integration: 깨끗한 Docker cache에서 이미지 빌드가 성공해야 한다.
- Integration: 빌드 로그에서 `youtube-dl-exec needs Python` 계열 오류가 발생하지 않아야 한다.
- Integration: 컨테이너 실행 후 `/health`가 `{ ok: true }`를 반환해야 한다.

**Verification:**
- 컨테이너 내부 `node --version`이 계획된 Node 22 patch 버전을 반환한다.

---

### U2. Pin yt-dlp Binary Used by youtube-dl-exec

**Goal:** `youtube-dl-exec` npm 패키지가 실행하는 `yt-dlp` 바이너리 버전을 고정한다.

**Requirements:** R2, R6

**Dependencies:** U1

**Files:**
- Modify: `Dockerfile`
- Modify: `README.md`
- Test: Docker image runtime verification

**Approach:**
- `pnpm install --frozen-lockfile` 실행 전에 `YOUTUBE_DL_HOST`를 특정 `yt-dlp` release API URL로 지정한다.
- 필요하면 `YOUTUBE_DL_FILENAME`은 기본 `yt-dlp`를 유지해 라이브러리 기본 경로와 충돌하지 않게 한다.
- pnpm lockfile은 그대로 유지하되, 바이너리 버전은 Dockerfile 또는 문서에서 별도 관리 대상으로 명시한다.

**Patterns to follow:**
- `pnpm-lock.yaml`으로 npm 의존성을 고정하는 현재 방식.
- `youtube-dl-exec`가 제공하는 postinstall 환경 변수.

**Test scenarios:**
- Integration: 컨테이너 내부 `node_modules/youtube-dl-exec/bin/yt-dlp --version`이 지정한 버전을 반환해야 한다.
- Error path: GitHub release asset URL이 잘못되면 Docker build가 조용히 성공하지 않고 실패해야 한다.

**Verification:**
- `youtube-dl-exec` npm 버전과 `yt-dlp` 바이너리 버전이 각각 확인 가능해야 한다.

---

### U3. Stabilize ffmpeg Installation

**Goal:** production 컨테이너에서 ffmpeg 설치 버전과 실행 경로의 변동성을 줄인다.

**Requirements:** R3, R6

**Dependencies:** U1

**Files:**
- Modify: `Dockerfile`
- Modify: `.env.example`
- Test: Docker image runtime verification

**Approach:**
- production stage에서 `ffmpeg`를 계속 apt로 설치하되, 가능한 경우 package version pinning을 적용한다.
- 선택한 Node Debian variant에서 제공되는 ffmpeg 버전을 구현 시점에 확인하고, pinning이 유지보수 부담을 과도하게 만들면 Debian variant pin + runtime version check를 최소안으로 둔다.
- `FFMPEG_LOCATION=/usr/bin/ffmpeg` 계약은 유지한다.

**Patterns to follow:**
- 현재 `.env.example`의 `/usr/bin/ffmpeg` 경로.
- audio/video service의 `ffmpegLocation` 전달 방식.

**Test scenarios:**
- Integration: 컨테이너 내부 `which ffmpeg`가 `/usr/bin/ffmpeg`를 반환해야 한다.
- Integration: 컨테이너 내부 `ffmpeg -version`이 문서화된 버전 또는 허용 범위와 일치해야 한다.
- Integration: audio/video service가 `FFMPEG_LOCATION=/usr/bin/ffmpeg` 환경에서 기존 옵션을 그대로 전달해야 한다.

**Verification:**
- Docker 실행 환경에서 ffmpeg 경로와 버전이 README의 고정 전략과 일치한다.

---

### U4. Document Runtime Pinning and Verification Workflow

**Goal:** 런타임 고정 전략과 검증 방법을 문서화해 이후 재빌드/업그레이드 시 기준을 명확히 한다.

**Requirements:** R5

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `README.md`
- Modify: `docs/api/current-implementation-fsd.md`
- Modify: `docs/api/current-implementation-prd.md`
- Test: Documentation review

**Approach:**
- README의 Requirements/Docker 섹션에 Node, ffmpeg, `yt-dlp`, `youtube-dl-exec`의 고정 범위를 분리해 적는다.
- 현재 구현 문서에는 “컨테이너 런타임 의존성은 Dockerfile 기준으로 고정한다”는 운영 전제를 반영한다.
- health endpoint가 실제 미디어 의존성 readiness를 보장하지 않는다는 기존 한계는 유지한다.

**Patterns to follow:**
- 기존 README의 짧은 실행 예시 중심 구성.
- 현재 구현 PRD/FSD의 “현재 한계와 주의사항” 문체.

**Test scenarios:**
- Documentation: README의 Docker 실행 방법만 보고도 env file과 컨테이너 실행 경로를 이해할 수 있어야 한다.
- Documentation: PRD/FSD가 실제 Dockerfile 전략과 충돌하지 않아야 한다.

**Verification:**
- 문서에 적힌 버전 고정 기준과 Dockerfile/env 예시가 서로 일치한다.

---

### U5. Add Lightweight Runtime Verification Script or npm Task

**Goal:** 컨테이너 내부 런타임 버전을 빠르게 확인할 수 있는 최소 검증 진입점을 제공한다.

**Requirements:** R1, R2, R3, R5

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `package.json`
- Create: `scripts/verify-runtime-dependencies.sh`
- Test: Runtime dependency verification script

**Approach:**
- Node, ffmpeg, `yt-dlp` 버전을 출력하고 필수 실행 파일이 없으면 실패하는 스크립트를 둔다.
- 네트워크 다운로드나 실제 YouTube 요청은 하지 않는다.
- npm script는 로컬과 컨테이너에서 모두 실행 가능하게 구성한다.

**Patterns to follow:**
- 기존 npm script 중심의 README 실행 방식.
- shell script는 런타임 존재/버전 확인만 담당하고 애플리케이션 로직을 호출하지 않는다.

**Test scenarios:**
- Happy path: 모든 실행 파일이 있으면 스크립트가 버전을 출력하고 성공해야 한다.
- Error path: ffmpeg가 없거나 `FFMPEG_LOCATION`이 잘못되면 실패해야 한다.
- Error path: `yt-dlp` 바이너리가 없으면 실패해야 한다.

**Verification:**
- Docker build 후 같은 명령으로 Node, ffmpeg, `yt-dlp` 버전을 확인할 수 있다.

---

## System-Wide Impact

- **Interaction graph:** Dockerfile, npm install lifecycle, environment file, audio/video service의 외부 바이너리 호출 경로가 연결된다.
- **Error propagation:** 잘못된 `yt-dlp` URL, Python 누락, ffmpeg package pin 실패는 build-time failure로 드러나야 한다.
- **State lifecycle risks:** 런타임 고정은 요청별 임시 디렉터리 생성/삭제 방식에는 영향을 주지 않는다.
- **API surface parity:** `/audio`, `/video`, `/health` 경로와 응답 계약은 유지한다.
- **Integration coverage:** 단위 테스트만으로는 외부 바이너리 존재와 버전을 증명할 수 없으므로 Docker image runtime verification이 필요하다.
- **Unchanged invariants:** `FFMPEG_LOCATION` 환경 변수 이름, `/usr/bin/ffmpeg` production 기본 경로, `youtube-dl-exec` 호출 방식은 유지한다.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 특정 `yt-dlp` release asset URL이 사라지거나 GitHub rate limit에 걸림 | 빌드 실패를 명확히 드러내고, 필요하면 release asset mirror 또는 사전 다운로드 전략을 후속 검토한다. |
| ffmpeg package version pin이 Debian 저장소 업데이트로 설치 불가해짐 | patch-level Node Debian variant와 `apt-cache policy` 확인을 함께 관리하고, 장기 재현 필요 시 Debian snapshot으로 분리한다. |
| Python을 build stage에 추가해 이미지가 커짐 | multi-stage build에서 production stage로 Python을 복사하지 않도록 제한한다. |
| Docker daemon이 꺼져 있으면 로컬 검증이 불가능함 | 계획 실행 시 Docker daemon 상태를 선행 확인하고, 실패 시 파일 변경 전 검증 불가 상태를 명시한다. |

---

## Documentation / Operational Notes

- 런타임 의존성은 npm lock, Docker base image, apt package, downloaded binary의 네 층으로 나눠 관리한다.
- 버전 업그레이드는 Node, ffmpeg, `yt-dlp`, `youtube-dl-exec`를 한 번에 올리기보다 하나씩 변경해 실패 원인을 분리한다.
- health endpoint는 계속 프로세스 응답성만 확인하므로, 실제 미디어 처리 readiness와 혼동하지 않게 문서에 유지한다.

---

## Sources & References

- Related code: `Dockerfile`
- Related code: `pnpm-lock.yaml`
- Related code: `apps/api/src/audio/audio.service.ts`
- Related code: `apps/api/src/video/video.service.ts`
- Related docs: `README.md`
- Related docs: `docs/api/current-implementation-fsd.md`
- Related docs: `docs/api/current-implementation-prd.md`
- External docs: `https://hub.docker.com/_/node`
- External docs: `https://raw.githubusercontent.com/docker-library/official-images/master/library/node`
- External docs: `https://github.com/microlinkhq/youtube-dl-exec`
- External docs: `https://docs.docker.com/build/building/best-practices/`
