import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import {
  PRODUCTION_WEB_ORIGIN,
  createCorsOptions,
} from './../src/cors-options';
import { MEDIA_DOWNLOADER } from './../src/media/media-downloader.port';
import { PrismaService } from './../src/prisma/prisma.service';

describe('MyTubeExtract API (e2e)', () => {
  let app: INestApplication;
  /** e2e job 저장소. */
  let jobs: Map<string, Record<string, unknown>>;
  /** e2e mock downloader. */
  const downloaderMock = {
    download: jest.fn(),
  };
  /** e2e Prisma mock. */
  const prismaMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    extractedAsset: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    },
    extractionJob: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    workerHeartbeat: {
      findUnique: jest.fn(),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MEDIA_DOWNLOADER)
      .useValue(downloaderMock)
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.enableCors(createCorsOptions({ nodeEnv: 'production' }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jobs = new Map();
    downloaderMock.download.mockResolvedValue(undefined);
    prismaMock.extractedAsset.findFirst.mockResolvedValue(null);
    prismaMock.workerHeartbeat.findUnique.mockResolvedValue({
      lastSeenAt: new Date(),
    });
    prismaMock.extractionJob.create.mockImplementation(({ data }) => {
      /** 생성된 e2e job ID. */
      const id = `job-${jobs.size + 1}`;
      /** 생성된 e2e job. */
      const job = {
        asset: null,
        createdAt: new Date('2026-06-24T05:32:00.000Z'),
        errorCode: null,
        id,
        ...data,
      };

      jobs.set(id, job);

      return Promise.resolve(job);
    });
    prismaMock.extractionJob.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(jobs.get(where.id) ?? null),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({
        ok: true,
        worker: {
          available: true,
        },
      });
  });

  it('/health returns worker unavailable without a heartbeat', () => {
    prismaMock.workerHeartbeat.findUnique.mockResolvedValueOnce(null);

    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({
        ok: true,
        worker: {
          available: false,
        },
      });
  });

  it('/health allows the production web origin and exposes media headers', async () => {
    /** Production web origin health response. */
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', PRODUCTION_WEB_ORIGIN)
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(
      PRODUCTION_WEB_ORIGIN,
    );
    expect(response.headers['access-control-expose-headers']).toBe(
      'Content-Disposition,Content-Type',
    );
  });

  it('/health rejects unknown browser origins without failing the request', async () => {
    /** Unknown browser origin health response. */
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('/video rejects invalid urls before starting a download', () => {
    return request(app.getHttpServer())
      .get('/video')
      .query({ url: 'not-a-url' })
      .expect(400);
  });

  it('/video rejects invalid filenames before starting a download', () => {
    return request(app.getHttpServer())
      .get('/video/abc123_DEF0')
      .query({ filename: '../secret' })
      .expect(400);
  });

  it('/video rejects invalid resolutions before starting a download', () => {
    return request(app.getHttpServer())
      .get('/video/abc123_DEF0')
      .query({ resolution: '1.5' })
      .expect(400);
  });

  it('/video rejects invalid YouTube ids before starting a download', () => {
    return request(app.getHttpServer()).get('/video/short').expect(400);
  });

  it('/audio rejects missing urls before starting a download', () => {
    return request(app.getHttpServer()).get('/audio').expect(400);
  });

  it('/audio rejects invalid bitrates before starting a download', () => {
    return request(app.getHttpServer())
      .get('/audio/abc123_DEF0')
      .query({ bitrate: '0' })
      .expect(400);
  });

  it('/downloads creates a URL based audio job without exposing file paths', async () => {
    /** 다운로드 job 생성 응답. */
    const response = await request(app.getHttpServer())
      .post('/downloads')
      .send({
        quality: '192',
        type: 'audio',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      jobId: expect.any(String),
      progress: 0,
      status: 'queued',
      type: 'audio',
    });
    expect(response.body.filePath).toBeUndefined();
    expect(response.body.fileUrl).toBeUndefined();
    expect(response.body.statusUrl).toBeUndefined();
  });

  it('/downloads rejects invalid job input before starting a download', () => {
    return request(app.getHttpServer())
      .post('/downloads')
      .send({
        type: 'audio',
        url: 'not-a-url',
      })
      .expect(400);
  });

  it('/downloads exposes queued job status', async () => {
    /** 다운로드 job 생성 응답. */
    const createResponse = await request(app.getHttpServer())
      .post('/downloads')
      .send({
        type: 'video',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/downloads/${createResponse.body.jobId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('queued');
        expect(response.body.displayStatus).toBe('queued');
        expect(response.body.progress).toBe(0);
      });
  });
});
