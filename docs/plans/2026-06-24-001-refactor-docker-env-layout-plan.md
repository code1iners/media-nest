# Dockerfile 및 환경 변수 구조 개선 계획

**목표:** API와 worker의 Dockerfile/env 책임을 분리해서, monorepo 구조를 유지하면서도 각 앱의 실행 경로를 명확하게 만든다.

**배경:** 현재 root `Dockerfile`이 API와 worker target을 함께 관리한다. 동작은 가능하지만 앱별 런타임, `CMD`, env 요구사항이 섞인다. env도 root `.env.example`과 `apps/*/.env.example`이 함께 있어, 어떤 파일을 기준으로 채워야 하는지 헷갈릴 수 있다.

**결론:** Dockerfile은 앱별로 분리하고, build context는 root로 유지한다. env example은 앱별 파일을 기준으로 삼고, Docker Compose용 env example은 별도 이름으로 둔다.

---

## 최종 구조

```txt
apps/api/Dockerfile
apps/api/.env.example

apps/worker/Dockerfile
apps/worker/.env.example

apps/web/.env.example

docker-compose.yml
docker-compose.env.example
```

```txt
root Dockerfile 제거
root .env.example 제거 또는 docker-compose.env.example으로 대체
```

---

## 원칙

- Dockerfile 위치는 각 앱 내부에 둔다.
- Docker build context는 root `.`를 유지한다.
- Dockerfile에서 root lockfile, workspace 설정, `packages/db`에 접근할 수 있어야 한다.
- API와 worker는 서로 다른 이미지로 빌드한다.
- root env는 앱 단독 실행 기준이 아니다.
- 앱 단독 실행 env 문서는 `apps/{app}/.env.example`을 기준으로 한다.
- Docker Compose 통합 실행 env 문서는 `docker-compose.env.example`을 기준으로 한다.

---

## 작업 1: API Dockerfile 분리

**파일:**

```txt
apps/api/Dockerfile
```

**내용:**

- root context 기준으로 monorepo 파일 복사
- `packages/db` build
- `apps/api` build
- production stage에서 API만 실행
- `CMD ["node", "apps/api/dist/main"]`

**유지할 값:**

```txt
NODE_ENV=production
PORT=3030
FFMPEG_LOCATION=/usr/bin/ffmpeg
```

**검증:**

```bash
docker build -f apps/api/Dockerfile -t mytube-extract-api:local .
docker run --rm --env-file apps/api/.env -p 3030:3030 mytube-extract-api:local
curl http://127.0.0.1:3030/health
```

---

## 작업 2: Worker Dockerfile 분리

**파일:**

```txt
apps/worker/Dockerfile
```

**내용:**

- root context 기준으로 monorepo 파일 복사
- `packages/db` build
- `apps/worker` build
- production stage에서 worker만 실행
- `CMD ["node", "apps/worker/dist/main"]`

**유지할 값:**

```txt
FFMPEG_LOCATION=/usr/bin/ffmpeg
```

**검증:**

```bash
docker build -f apps/worker/Dockerfile -t mytube-extract-worker:local .
docker run --rm --env-file apps/worker/.env mytube-extract-worker:local
```

---

## 작업 3: docker-compose.yml 수정

**파일:**

```txt
docker-compose.yml
```

**변경:**

```yaml
services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    image: mytube-extract-api:latest
    env_file:
      - docker-compose.env
    ports:
      - "127.0.0.1:3030:3030"

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    image: mytube-extract-worker:latest
    env_file:
      - docker-compose.env
```

**주의:** `context: apps/api` 또는 `context: apps/worker`로 바꾸면 안 된다. `packages/db`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` 접근이 끊긴다.

**검증:**

```bash
docker compose config
docker compose up -d --build
curl http://127.0.0.1:3030/health
docker compose logs -f worker
```

---

## 작업 4: Env example 정리

**파일:**

```txt
docker-compose.env.example
apps/api/.env.example
apps/worker/.env.example
apps/web/.env.example
```

**root `.env.example`:**

```txt
삭제 또는 docker-compose.env.example으로 이름 변경
```

**docker-compose.env.example:**

```env
NODE_ENV=production
PORT=3030

DATABASE_URL=
DIRECT_URL=

R2_ENDPOINT=
R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PUBLIC_BASE_URL=

ASSET_RETENTION_DAYS=7
WORKER_LOOP_INTERVAL_MS=60000
WORKER_PROCESSING_TIMEOUT_MS=3600000
```

**apps/api/.env.example:**

```env
NODE_ENV=development
PORT=3030

DATABASE_URL=
DIRECT_URL=

R2_ENDPOINT=
R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PUBLIC_BASE_URL=

ASSET_RETENTION_DAYS=7
```

**apps/worker/.env.example:**

```env
DATABASE_URL=
DIRECT_URL=

R2_ENDPOINT=
R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=

ASSET_RETENTION_DAYS=7
WORKER_LOOP_INTERVAL_MS=60000
WORKER_PROCESSING_TIMEOUT_MS=3600000
```

**apps/web/.env.example:**

```env
VITE_MYTUBE_EXTRACT_API_BASE_URL=http://127.0.0.1:3030
```

---

## 작업 5: Root Dockerfile 제거

**파일:**

```txt
Dockerfile
```

**변경:**

```txt
root Dockerfile 삭제
```

단, 운영 배포 스크립트나 README가 root Dockerfile을 참조하고 있으면 먼저 참조를 `apps/api/Dockerfile`, `apps/worker/Dockerfile`로 바꾼다.

**검증:**

```bash
rg "Dockerfile|docker build" README.md docs docker-compose.yml
```

---

## 작업 6: 최종 검증

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
docker compose config
docker compose up -d --build
curl http://127.0.0.1:3030/health
```

실제 통합 검증:

```bash
curl -X POST http://127.0.0.1:3030/downloads \
  -H "Content-Type: application/json" \
  -d '{"type":"audio","quality":"default","url":"https://youtu.be/dQw4w9WgXcQ"}'
```

기대:

```txt
queued -> processing -> completed
downloadUrl 반환
R2 public URL HEAD 200
```

---

## 제외 범위

- `turbo prune` 도입은 제외한다.
- CI/CD 파이프라인 분리는 제외한다.
- web Dockerfile은 제외한다. web은 Vercel 배포 기준이다.
- R2 credential 분리는 제외한다. 현재 MVP는 API/worker 공용 credential을 유지한다.

---

## 리스크

- Docker context를 앱 폴더로 줄이면 monorepo dependency가 깨진다.
- `@mytube-extract/db` generated Prisma client가 Docker deploy 산출물에 포함되어야 한다.
- app별 `.env`와 compose env가 drift될 수 있다. example 파일을 역할별로 명확히 유지해야 한다.
- Docker daemon이 꺼져 있으면 compose 검증은 불가하다.
