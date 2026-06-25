import { ConfigService } from '@nestjs/config';
import { HealthService, isWorkerHeartbeatAvailable } from './health.service';

describe('HealthService', () => {
  /** Prisma mock. */
  const prismaMock = {
    workerHeartbeat: {
      findUnique: jest.fn(),
    },
  };
  /** config service mock. */
  const configServiceMock = {
    get: jest.fn((key: string) => {
      if (key === 'WORKER_HEARTBEAT_STALE_MS') {
        return '15000';
      }

      return undefined;
    }),
  };
  /** 테스트 대상 service. */
  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HealthService(
      prismaMock as never,
      configServiceMock as unknown as ConfigService,
    );
  });

  it('marks the worker available when the heartbeat is fresh', async () => {
    prismaMock.workerHeartbeat.findUnique.mockResolvedValueOnce({
      lastSeenAt: new Date(),
    });

    await expect(service.health()).resolves.toEqual({
      ok: true,
      worker: { available: true },
    });
    expect(prismaMock.workerHeartbeat.findUnique).toHaveBeenCalledWith({
      select: { lastSeenAt: true },
      where: { id: 'default' },
    });
  });

  it('marks the worker unavailable when no heartbeat exists', async () => {
    prismaMock.workerHeartbeat.findUnique.mockResolvedValueOnce(null);

    await expect(service.health()).resolves.toEqual({
      ok: true,
      worker: { available: false },
    });
  });

  it('marks stale heartbeats unavailable', () => {
    /** stale 기준보다 오래된 heartbeat 시각. */
    const lastSeenAt = new Date('2026-06-25T00:00:00.000Z');
    /** 현재 시각. */
    const now = new Date('2026-06-25T00:00:16.000Z');

    expect(isWorkerHeartbeatAvailable(lastSeenAt, 15_000, now)).toBe(false);
  });
});
