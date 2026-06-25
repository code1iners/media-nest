import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/** 단일 worker heartbeat row ID. */
const WORKER_HEARTBEAT_ID = 'default';

/** worker heartbeat stale 기본 기준. */
const DEFAULT_WORKER_HEARTBEAT_STALE_MS = 15_000;

/** API health 응답. */
export type HealthResponse = {
  /** API 프로세스 응답 가능 여부. */
  ok: true;
  /** worker 처리 가능 상태. */
  worker: {
    /** 최근 heartbeat 기준 worker 사용 가능 여부. */
    available: boolean;
  };
};

/** API와 worker 상태를 조합하는 health service. */
@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /** API process와 worker 가용 상태를 반환한다. */
  async health(): Promise<HealthResponse> {
    /** 단일 worker heartbeat row. */
    const heartbeat = await this.prisma.workerHeartbeat.findUnique({
      select: { lastSeenAt: true },
      where: { id: WORKER_HEARTBEAT_ID },
    });

    return {
      ok: true,
      worker: {
        available: isWorkerHeartbeatAvailable(
          heartbeat?.lastSeenAt ?? null,
          this.getWorkerHeartbeatStaleMs(),
        ),
      },
    };
  }

  /** worker heartbeat stale 기준을 읽는다. */
  private getWorkerHeartbeatStaleMs() {
    return parsePositiveNumber(
      this.configService.get<string>('WORKER_HEARTBEAT_STALE_MS'),
      DEFAULT_WORKER_HEARTBEAT_STALE_MS,
    );
  }
}

/** 최근 heartbeat가 stale 기준 안에 있는지 확인한다. */
export function isWorkerHeartbeatAvailable(
  lastSeenAt: Date | null,
  staleAfterMs: number,
  now = new Date(),
) {
  if (!lastSeenAt) {
    return false;
  }

  return now.getTime() - lastSeenAt.getTime() <= staleAfterMs;
}

/** 양수 환경 숫자값을 기본값과 함께 읽는다. */
function parsePositiveNumber(value: string | undefined, fallback: number) {
  /** 숫자로 변환한 환경 변수 값. */
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallback;
}
