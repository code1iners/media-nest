import { describe, expect, it } from 'vitest';
import {
  type DownloadDraft,
  buildCreateDownloadJobRequest,
  validateDownloadDraft,
  waitForDownloadJob,
} from '../../src/domain/download-request/download-request';

/** 테스트용 기본 다운로드 입력값. */
const baseDraft: DownloadDraft = {
  mode: 'audio',
  quality: 'default',
  sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
};

describe('download request', () => {
  it('requires a source URL', () => {
    /** 검증 결과. */
    const validation = validateDownloadDraft({ ...baseDraft, sourceUrl: ' ' });

    expect(validation.kind).toBe('empty');
  });

  it('rejects malformed source URLs', () => {
    /** 검증 결과. */
    const validation = validateDownloadDraft({
      ...baseDraft,
      sourceUrl: 'not-url',
    });

    expect(validation.kind).toBe('invalid');
  });

  it('rejects non-YouTube URLs', () => {
    /** 검증 결과. */
    const validation = validateDownloadDraft({
      ...baseDraft,
      sourceUrl: 'https://example.com/video',
    });

    expect(validation.kind).toBe('invalid');
  });

  it('accepts YouTube Shorts URLs', () => {
    /** 검증 결과. */
    const validation = validateDownloadDraft({
      ...baseDraft,
      sourceUrl: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    });

    expect(validation.kind).toBe('ready');
  });

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

  it('builds a video download job request', () => {
    /** 생성된 다운로드 job 요청. */
    const request = buildCreateDownloadJobRequest(
      {
        ...baseDraft,
        mode: 'video',
        quality: '720',
      },
      'https://mytube-extract.example',
    );

    expect(request.url).toBe('https://mytube-extract.example/downloads');
    expect(request.body).toMatchObject({
      quality: '720',
      type: 'video',
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
});
