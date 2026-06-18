# Docker Compose Operations Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** `media-nest` 운영 방식을 수동 `docker build`/`docker run`에서 재현 가능한 `docker compose up -d --build` 방식으로 전환한다.

**Architecture:** 단일 NestJS API 컨테이너를 Docker Compose 서비스로 정의한다. 앱은 컨테이너 내부 `3030` 포트에서 실행하고, 호스트에는 `127.0.0.1:3030`으로만 바인딩해서 nginx/Cloudflare 같은 외부 프록시 뒤에서 안전하게 운영한다. 런타임 의존성 검증은 기존 `npm run verify:runtime`과 Dockerfile `HEALTHCHECK`를 그대로 활용한다.

**Tech Stack:** Docker Compose, Dockerfile, NestJS, Node.js 22, yt-dlp, ffmpeg, bash/curl.

---

## Acceptance Criteria

- `docker compose config`가 성공한다.
- `docker compose up -d --build`로 서비스가 백그라운드 실행된다.
- `docker compose ps`에서 `media-nest`가 `running` 또는 `healthy` 상태다.
- `curl http://127.0.0.1:3030/health`가 성공한다.
- `docker compose run --rm media-nest npm run verify:runtime`가 성공한다.
- README에 compose 기반 운영 명령이 문서화된다.
- 기존 Dockerfile의 고정 런타임 의존성 검증 흐름은 유지된다.

---

### Task 1: Create Docker Compose file

**Objective:** 운영용 Compose 정의를 추가한다.

**Files:**
- Create: `docker-compose.yml`

**Step 1: Create `docker-compose.yml`**

```yaml
services:
  media-nest:
    build:
      context: .
    image: media-nest:latest
    container_name: media-nest
    restart: unless-stopped
    env_file:
      - .env.production
    ports:
      - "127.0.0.1:3030:3030"
```

**Step 2: Validate compose syntax**

```bash
cd /home/ubuntu/workspace/media-nest
docker compose config
```

Expected: normalized compose config 출력, exit code `0`.

**Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: docker compose 운영 설정 추가"
```

---

### Task 2: Add production env bootstrap guidance

**Objective:** `.env.production`이 없을 때 안전하게 만들 수 있는 절차를 문서화한다.

**Files:**
- Modify: `README.md`

**Step 1: Add environment setup command**

README `Environment` 또는 `Run With Docker` 섹션에 아래 내용을 추가한다.

```bash
cp .env.example .env.production
# 필요한 경우 EXTENSION_ID 값을 채운다.
```

**Step 2: Verify `.env.example` has required keys**

```bash
cd /home/ubuntu/workspace/media-nest
grep -E '^(NODE_ENV|PORT|FFMPEG_LOCATION|EXTENSION_ID|EXPECTED_)' .env.example
```

Expected: `NODE_ENV`, `PORT`, `FFMPEG_LOCATION`, `EXTENSION_ID`, `EXPECTED_*` 값들이 보인다.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: 운영 환경 파일 준비 절차 추가"
```

---

### Task 3: Replace Docker run docs with Compose docs

**Objective:** 운영자가 한 가지 표준 명령만 쓰도록 README의 Docker 실행 절차를 compose 중심으로 바꾼다.

**Files:**
- Modify: `README.md`

**Step 1: Replace Run With Docker section**

기존:

```bash
docker build -t media-nest:latest .
docker run --env-file .env.production -d -p 3030:3030 media-nest:latest
```

교체:

```bash
cd /home/ubuntu/workspace/media-nest
docker compose up -d --build
```

**Step 2: Add status/log commands**

```bash
docker compose ps
docker compose logs -f --tail=100 media-nest
```

**Step 3: Add stop/restart commands**

```bash
docker compose restart media-nest
docker compose down
```

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: docker compose 운영 명령 문서화"
```

---

### Task 4: Add standard update procedure

**Objective:** 배포/업데이트를 `git pull → docker compose up -d --build → health check`로 고정한다.

**Files:**
- Modify: `README.md`

**Step 1: Add update section**

```markdown
## Update / Deploy

```bash
cd /home/ubuntu/workspace/media-nest
git pull --ff-only
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3030/health
```

런타임 의존성 검증:

```bash
docker compose run --rm media-nest npm run verify:runtime
```
```

**Step 2: Verify commands are copy-pasteable**

```bash
cd /home/ubuntu/workspace/media-nest
docker compose config
```

Expected: exit code `0`.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: compose 기반 배포 절차 추가"
```

---

### Task 5: Runtime verification with temporary deployment

**Objective:** compose 전환이 실제 컨테이너 실행까지 되는지 검증한다.

**Files:**
- No file changes expected.

**Step 1: Ensure env file exists**

```bash
cd /home/ubuntu/workspace/media-nest
test -f .env.production || cp .env.example .env.production
```

**Step 2: Build and start**

```bash
docker compose up -d --build
```

Expected: `media-nest` 컨테이너 생성/재생성 후 백그라운드 실행.

**Step 3: Check service status**

```bash
docker compose ps
```

Expected: `media-nest` is `running`; Docker health status는 시작 직후 `starting`일 수 있고 잠시 후 `healthy`가 되어야 한다.

**Step 4: Check HTTP health endpoint**

```bash
curl -fsS http://127.0.0.1:3030/health
```

Expected:

```json
{"ok":true}
```

**Step 5: Check runtime dependencies**

```bash
docker compose run --rm media-nest npm run verify:runtime
```

Expected: Node.js 22, yt-dlp `2026.06.09`, ffmpeg `5.1.8` 확인 후 exit code `0`.

---

### Task 6: Operational rollback note

**Objective:** compose 배포 실패 시 빠르게 복구할 수 있는 명령을 README에 남긴다.

**Files:**
- Modify: `README.md`

**Step 1: Add rollback section**

```markdown
## Rollback / Recovery

최근 git 커밋으로 되돌려 재빌드:

```bash
cd /home/ubuntu/workspace/media-nest
git log --oneline -5
git checkout <known-good-commit>
docker compose up -d --build
curl -fsS http://127.0.0.1:3030/health
```

다시 main 최신으로 복귀:

```bash
git checkout main
git pull --ff-only
docker compose up -d --build
```
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: compose 배포 롤백 절차 추가"
```

---

## Recommended Implementation Order

1. `docker-compose.yml` 추가
2. README 운영 명령 정리
3. `docker compose config` 검증
4. `docker compose run --rm media-nest npm run verify:runtime` 검증
5. 짧은 실제 배포 테스트: `docker compose up -d --build`
6. `/health` 검증
7. 필요하면 nginx upstream이 `127.0.0.1:3030`을 바라보는지 별도 확인

---

## Final Verification Commands

```bash
cd /home/ubuntu/workspace/media-nest

docker compose config

docker compose run --rm media-nest npm run verify:runtime

docker compose up -d --build

docker compose ps

curl -fsS http://127.0.0.1:3030/health
```

---

## Notes

- 포트는 외부 전체 공개인 `0.0.0.0:3030`이 아니라 `127.0.0.1:3030`으로 바인딩한다.
- Cloudflare/nginx 앞단을 쓸 가능성이 높으므로 앱 컨테이너는 로컬에서만 열어두는 편이 안전하다.
- `docker compose down`은 컨테이너를 내리므로 운영 중에는 업데이트에 `docker compose up -d --build`를 기본으로 사용한다.
- 현재 서비스는 상태 저장 볼륨이 필요 없어 보인다. 다운로드 결과를 디스크에 보존하는 기능이 추가되기 전까지는 volume을 만들지 않는다.
