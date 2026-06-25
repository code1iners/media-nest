---
title: feat: web에서 worker 미가용 상태 안내
type: feat
status: implemented
date: 2026-06-25
---

# feat: web에서 worker 미가용 상태 안내

## PRD

### 문제 정의

현재 web 앱은 API가 응답하면 다운로드 job을 만들 수 있다고 판단한다. 하지만 실제 파일 추출은 별도 worker가 처리하므로 worker가 죽어 있으면 사용자는 `queued` 상태에서 기다리다가 서비스가 멈춘 것처럼 느낀다.

### 목표

worker가 죽어 있거나 heartbeat가 만료된 상태에서는 web 앱에서 추출 요청을 막고, 사용자에게 지금은 서비스 시간이 아니라 사용할 수 없다는 안내를 보여준다.

### 사용자 가치

- 사용자는 처리되지 않을 요청을 제출하기 전에 서비스 미가용 상태를 알 수 있다.
- 운영자는 API 프로세스 생존 여부와 worker 처리 가능 여부를 구분할 수 있다.
- `queued` 상태 무한 대기처럼 보이는 경험을 줄인다.

### 요구 사항

- R1. API는 HTTP 프로세스 health와 worker 가용 상태를 함께 반환해야 한다.
- R2. worker는 주기적으로 heartbeat를 남겨 API가 최근 worker 생존 여부를 판단할 수 있게 해야 한다.
- R3. web 앱은 진입 시, 추출 요청 직전, job polling 중 worker 가용 상태를 확인해야 한다.
- R4. worker 미가용이면 추출 요청 form을 사용할 수 없게 하고 안내 문구를 보여줘야 한다.
- R5. 사용자 안내 문구는 “지금은 서비스 시간이 아니라 사용할 수 없습니다.”를 기준으로 한다.
- R6. 기존 Chrome extension의 `/health` 확인 흐름은 깨지지 않아야 한다.

### 제외 범위

- 운영 시간표 관리 UI
- 관리자 수동 ON/OFF 토글
- 다중 worker 분산 처리
- Redis/BullMQ 도입
- 사용자별 알림, 대기열 예약, 자동 재시도

### 성공 기준

- API가 살아 있어도 worker heartbeat가 없거나 만료되면 web 앱이 요청을 막는다.
- worker가 다시 heartbeat를 기록하면 web 앱은 다음 health 확인 후 요청 가능 상태로 돌아온다.
- job polling 중 worker heartbeat가 만료되면 web 앱은 서비스 미가용 안내를 표시한다.
- 기존 `/health` 소비자는 `ok: true`만 확인해도 계속 동작한다.

## FSD

### 현재 기준

- API `/health`는 현재 `{ "ok": true }`만 반환한다.
- web 앱은 현재 `/downloads` job 생성과 `/downloads/:jobId` polling만 사용한다.
- worker는 DB에서 `queued` job을 FIFO로 claim하지만, worker process heartbeat를 저장하지 않는다.

### API 계약

`GET /health` 응답에 `worker` 필드를 추가한다.

```json
{
  "ok": true,
  "worker": {
    "available": true
  }
}
```

규칙:

- `ok`는 기존처럼 API HTTP 프로세스 응답 가능 여부를 의미한다.
- `worker.available`은 최근 heartbeat가 `WORKER_HEARTBEAT_STALE_MS` 안에 있으면 `true`다.
- `WORKER_HEARTBEAT_STALE_MS`는 API 내부 판정용 환경 변수이며, 응답에는 포함하지 않는다.
- heartbeat row가 없거나 만료되면 `worker.available`은 `false`다.
- Web 앱은 `worker.available`만 보고 사용 가능 여부를 판단한다.
- 구현 시 `apps/api/.env`와 `docker-compose.env`에 `WORKER_HEARTBEAT_STALE_MS`를 직접 설정한다.

### DB 변경

Prisma에 worker heartbeat용 단일 row 모델과 migration을 추가한다.

```prisma
model WorkerHeartbeat {
  id        String   @id
  lastSeenAt DateTime
  updatedAt DateTime @updatedAt
}
```

운영 v1은 단일 worker만 지원하므로 `id`는 고정값 `default`를 사용한다.
단일 row 조회만 하므로 별도 index는 추가하지 않는다.

### Worker 변경

- worker는 main loop와 별도 heartbeat timer를 시작해 고정 `default` row를 주기적으로 upsert한다.
- heartbeat 쓰기 실패는 로그로 남기고 다음 tick에서 다시 시도한다.
- heartbeat timer 간격은 기존 `WORKER_LOOP_INTERVAL_MS`를 재사용한다.
- 긴 job 처리 중에도 heartbeat가 끊기지 않아야 한다.

### Web 변경

- `apps/web`에 `@tanstack/react-query`를 추가한다.
- `apps/web/src/main.tsx`에 `QueryClientProvider`를 추가한다.
- `apps/web/src/domain/download-request/download-request.ts`는 form schema, draft validation, type/quality 규칙 같은 순수 domain logic만 유지한다.
- `/health`, `/downloads`, `/downloads/:jobId` 호출은 별도 API client module로 분리한다.
- worker health 조회는 TanStack Query `useQuery`로 관리한다.
- `useQuery`의 최초 fetch가 진입 시 확인을 담당하고, `refetchInterval`이 polling을 담당한다.
- 다운로드 job 생성 submit은 TanStack Query `useMutation`으로 관리한다.
- submit 직전 worker health 확인은 mutation 내부에서 `queryClient.fetchQuery()` 또는 health query의 `refetch()`로 즉시 수행한다.
- `worker.available === false`면 submit을 중단하고 form submit button을 비활성화한다.
- 표시 문구: `지금은 서비스 시간이 아니라 사용할 수 없습니다.`

### UI 상태

| 상태 | 조건 | 사용자 표시 |
| --- | --- | --- |
| 확인 중 | health 요청 진행 중 | 기존 form은 유지하되 submit 비활성화 |
| 사용 가능 | `worker.available === true` | 기존 흐름 유지 |
| 사용 불가 | `worker.available === false` | 서비스 시간 아님 안내, submit 비활성화 |
| 확인 실패 | `/health` 요청 실패 | 기존 요청 실패 문구를 재사용하거나 서버 확인 실패 안내 |

### 테스트

- API unit: heartbeat가 최신이면 `worker.available: true`
- API unit: heartbeat가 없거나 stale이면 `worker.available: false`
- Worker unit 또는 integration: heartbeat upsert가 고정 `default` row를 갱신
- Web unit: worker 미가용 health 응답이면 submit 요청을 보내지 않음
- Web unit: submit 직전 health가 미가용이면 `/downloads` 호출 없음
- Web unit: TanStack Query polling 결과가 worker 미가용이면 서비스 미가용 문구를 표시
- Web unit: `download-request.ts`는 API 호출 없이 입력 검증과 request draft 규칙만 검증

## 구현 순서

1. Prisma schema와 migration에 단일 row `WorkerHeartbeat` 모델 추가
2. worker heartbeat timer와 upsert 추가
3. API `/health` 응답 확장
4. `apps/api/.env`, `docker-compose.env`, env example에 `WORKER_HEARTBEAT_STALE_MS` 반영
5. `apps/web`에 `@tanstack/react-query`와 `QueryClientProvider` 추가
6. web API client module과 `useQuery`/`useMutation` hook 추가
7. `download-request.ts`를 순수 domain 책임으로 정리
8. 최소 단위 테스트 추가

## 확정 결정

- “서비스 시간 아님”은 v1에서 실제 운영 시간표가 아니라 worker heartbeat 미가용의 사용자 안내 문구로 사용한다.
- worker 상태 저장은 DB heartbeat를 사용한다.
- worker 상태는 기존 `GET /health` 응답의 `worker.available`로만 노출한다.
- worker stale 기준은 API 내부 `WORKER_HEARTBEAT_STALE_MS` 환경 변수로 정한다.
- Web worker health 조회는 TanStack Query `useQuery`와 `refetchInterval`로 처리한다.
- Web 다운로드 submit은 TanStack Query `useMutation`으로 처리하고, submit 직전 worker health를 mutation 내부에서 재확인한다.
- `download-request.ts`에는 API 호출 책임을 두지 않는다.
- 구현자는 로컬 env 설정을 사용자에게 넘기지 않고 직접 반영한다.

## Sources & References

- Related code: `apps/api/src/health/health.controller.ts`
- Related code: `apps/worker/src/main.ts`
- Related code: `apps/web/src/app/app.tsx`
- Related code: `apps/web/src/domain/download-request/download-request.ts`
- Related docs: `docs/api/current-implementation-fsd.md`
- Related docs: `docs/web/current-implementation-fsd.md`
