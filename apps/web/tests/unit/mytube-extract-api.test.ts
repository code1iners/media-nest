import { describe, expect, it } from 'vitest';
import {
  ServiceStatusFormatError,
  WorkerUnavailableError,
  assertWorkerAvailable,
  buildCreateDownloadJobRequest,
  createSubtitleJob,
  getWorkerHealth,
  waitForDownloadJob,
  waitForSubtitleJob,
} from '../../src/api/mytube-extract.api';
import type { DownloadDraft } from '../../src/domain/download-request/download-request';

/** 테스트용 기본 다운로드 입력값. */
const baseDraft: DownloadDraft = {
  mode: 'audio',
  quality: '320',
  sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
};

describe('mytube extract api client', () => {
  it('builds an audio download job request', () => {
    /** 생성된 다운로드 job 요청. */
    const request = buildCreateDownloadJobRequest(
      {
        ...baseDraft,
        quality: '192',
      },
      'http://127.0.0.1:3030',
    );

    expect(request.url).toBe('http://127.0.0.1:3030/downloads');
    expect(request.body).toEqual({
      quality: '192',
      type: 'audio',
      url: baseDraft.sourceUrl,
    });
  });

  it('uses the configured API base URL without dropping its path', () => {
    /** 생성된 다운로드 job 요청. */
    const request = buildCreateDownloadJobRequest(
      baseDraft,
      'https://mytube-extract.example/api/',
    );

    expect(request.url).toBe('https://mytube-extract.example/api/downloads');
  });

  it('reads worker availability from health', async () => {
    /** health 조회 mock fetch. */
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          ok: true,
          worker: { available: false },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        },
      );

    await expect(
      getWorkerHealth({
        apiBaseUrl: 'https://mytube-extract.example/api',
        fetcher,
      }),
    ).resolves.toEqual({
      ok: true,
      worker: { available: false },
    });
  });

  it('throws a displayable error when worker health omits worker state', async () => {
    /** 이전 배포 health 응답 mock fetch. */
    const fetcher = async () =>
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });

    await expect(
      getWorkerHealth({
        apiBaseUrl: 'https://mytube-extract.example/api',
        fetcher,
      }),
    ).rejects.toMatchObject({
      detail: {
        code: 'SERVICE_STATUS_FORMAT_ERROR',
        location: '서비스 상태 확인',
        responseBody: '{"ok":true}',
        responseStatus: 200,
      },
    });
    await expect(
      getWorkerHealth({
        apiBaseUrl: 'https://mytube-extract.example/api',
        fetcher,
      }),
    ).rejects.toBeInstanceOf(ServiceStatusFormatError);
  });

  it('throws when worker health is unavailable', () => {
    expect(() =>
      assertWorkerAvailable({
        ok: true,
        worker: { available: false },
      }),
    ).toThrow(WorkerUnavailableError);
  });

  it('throws when worker health is missing', () => {
    expect(() => assertWorkerAvailable(undefined)).toThrow(
      WorkerUnavailableError,
    );
  });

  it('polls until a terminal completed status', async () => {
    /** status 조회 mock fetch. */
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          createdAt: '2026-06-24T05:32:00.000Z',
          displayStatus: 'completed',
          downloadUrl: '/downloads/job-1/file',
          errorCode: null,
          jobId: 'job-1',
          message: '파일이 준비되었습니다.',
          progress: 100,
          quality: '192',
          retentionDays: 7,
          status: 'completed',
          type: 'audio',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        },
      );

    await expect(
      waitForDownloadJob(
        {
          createdAt: '2026-06-24T05:32:00.000Z',
          displayStatus: 'queued',
          downloadUrl: null,
          errorCode: null,
          jobId: 'job-1',
          message: '요청이 접수되어 대기 중입니다.',
          progress: 0,
          quality: '192',
          retentionDays: 7,
          status: 'queued',
          type: 'audio',
        },
        {
          apiBaseUrl: 'https://mytube-extract.example/api',
          fetcher,
          intervalMs: 0,
        },
      ),
    ).resolves.toMatchObject({
      displayStatus: 'completed',
      downloadUrl: '/downloads/job-1/file',
    });
  });

  it('creates a subtitle job with multipart form data', async () => {
    /** 업로드 요청 mock fetch. */
    const fetcher = async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(_url)).toBe(
        'https://mytube-extract.example/api/subtitles/jobs',
      );
      expect(init?.method).toBe('POST');
      expect(init?.body).toBeInstanceOf(FormData);
      expect((init?.body as FormData).get('whisperModel')).toBe('small_en');

      return new Response(
        JSON.stringify({
          createdAt: '2026-07-03T01:00:00.000Z',
          displayStatus: 'queued',
          downloadUrl: null,
          errorCode: null,
          fileName: 'sample-video.mp4',
          jobId: 'subtitle-job-1',
          message: '요청이 접수되어 대기 중입니다.',
          progress: 10,
          retentionDays: 7,
          stage: 'queued',
          status: 'queued',
          whisperModel: 'small_en',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    };

    await expect(
      createSubtitleJob(
        new File(['video'], 'sample-video.mp4', { type: 'video/mp4' }),
        'small_en',
        {
          apiBaseUrl: 'https://mytube-extract.example/api',
          fetcher,
        },
      ),
    ).resolves.toMatchObject({
      displayStatus: 'queued',
      jobId: 'subtitle-job-1',
    });
  });

  it('polls subtitle jobs until a terminal completed status', async () => {
    /** status 조회 mock fetch. */
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          createdAt: '2026-07-03T01:00:00.000Z',
          displayStatus: 'completed',
          downloadUrl: '/subtitles/jobs/subtitle-job-1/file',
          errorCode: null,
          fileName: 'sample-video.mp4',
          jobId: 'subtitle-job-1',
          message: '영어 SRT가 준비되었습니다.',
          progress: 100,
          retentionDays: 7,
          stage: 'completed',
          status: 'completed',
          whisperModel: 'base_en',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        },
      );

    await expect(
      waitForSubtitleJob(
        {
          createdAt: '2026-07-03T01:00:00.000Z',
          displayStatus: 'queued',
          downloadUrl: null,
          errorCode: null,
          fileName: 'sample-video.mp4',
          jobId: 'subtitle-job-1',
          message: '요청이 접수되어 대기 중입니다.',
          progress: 10,
          retentionDays: 7,
          stage: 'queued',
          status: 'queued',
          whisperModel: 'base_en',
        },
        {
          apiBaseUrl: 'https://mytube-extract.example/api',
          fetcher,
          intervalMs: 0,
        },
      ),
    ).resolves.toMatchObject({
      displayStatus: 'completed',
      downloadUrl: '/subtitles/jobs/subtitle-job-1/file',
    });
  });
});
