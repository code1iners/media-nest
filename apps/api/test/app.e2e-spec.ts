import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('MediaNest API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
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
});
