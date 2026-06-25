import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  /** health service mock. */
  const healthServiceMock = {
    health: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    healthServiceMock.health.mockResolvedValue({
      ok: true,
      worker: { available: true },
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: healthServiceMock,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns the process and worker health response', async () => {
    await expect(controller.health()).resolves.toEqual({
      ok: true,
      worker: { available: true },
    });
    expect(healthServiceMock.health).toHaveBeenCalledTimes(1);
  });
});
