import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import {
  PRODUCTION_WEB_ORIGIN,
  createCorsOptions,
} from './../src/cors-options';
import { MEDIA_DOWNLOADER } from './../src/media/media-downloader.port';

/** e2e 다운로드 mock 제어 핸들. */
type DownloadDeferred = {
  /** mock 다운로드 promise. */
  promise: Promise<void>;
  /** mock 다운로드 성공 resolver. */
  resolve: () => void;
  /** mock 다운로드 실패 rejecter. */
  reject: (error: Error) => void;
};

/** mock downloader가 대기할 promise를 만든다. */
function createDownloadDeferred(): DownloadDeferred {
  /** 성공 resolver. */
  let resolve: () => void = () => undefined;
  /** 실패 rejecter. */
  let reject: (error: Error) => void = () => undefined;
  /** mock 다운로드 promise. */
  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

/** async job worker가 상태를 반영할 시간을 준다. */
function flushAsync() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

describe('MyTubeExtract API (e2e)', () => {
  let app: INestApplication;
  /** e2e mock downloader. */
  const downloaderMock = {
    download: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MEDIA_DOWNLOADER)
      .useValue(downloaderMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.enableCors(createCorsOptions({ nodeEnv: 'production' }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    downloaderMock.download.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ ok: true });
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
        url: 'https://example.com/video',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      fileUrl: expect.stringMatching(/^\/downloads\/.+\/file$/),
      jobId: expect.any(String),
      status: 'queued',
      statusUrl: expect.stringMatching(/^\/downloads\/.+$/),
      type: 'audio',
    });
    expect(response.body.filePath).toBeUndefined();

    await flushAsync();
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

  it('/downloads exposes status and rejects file download while running', async () => {
    /** pending downloader 제어 핸들. */
    const deferred = createDownloadDeferred();
    downloaderMock.download.mockReturnValueOnce(deferred.promise);

    /** 다운로드 job 생성 응답. */
    const createResponse = await request(app.getHttpServer())
      .post('/downloads')
      .send({
        type: 'video',
        url: 'https://example.com/video',
      })
      .expect(201);

    await flushAsync();

    await request(app.getHttpServer())
      .get(`/downloads/${createResponse.body.jobId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('running');
      });

    await request(app.getHttpServer())
      .get(`/downloads/${createResponse.body.jobId}/file`)
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/downloads/${createResponse.body.jobId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('canceled');
      });

    deferred.reject(new Error('aborted'));
    await flushAsync();
  });
});
