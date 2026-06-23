import { describe, expect, it } from 'vitest';
import {
  type DownloadDraft,
  buildCreateDownloadJobRequest,
  waitForDownloadJobFileUrl,
  validateDownloadDraft,
} from '../../src/domain/download-request/download-request';

/** 테스트용 기본 다운로드 입력값. */
const baseDraft: DownloadDraft = {
  sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  mode: 'audio',
  filename: '',
  quality: '',
};

describe('download request', () => {
  it('requires a source URL', () => {
    /** 검증 결과. */
    const validation = validateDownloadDraft({ ...baseDraft, sourceUrl: ' ' });

    expect(validation.kind).toBe('empty');
  });

  it('rejects malformed source URLs', () => {
    /** 검증 결과. */
    const validation = validateDownloadDraft({ ...baseDraft, sourceUrl: 'not-url' });

    expect(validation.kind).toBe('invalid');
  });

  it('rejects non-positive integer quality values before opening the API URL', () => {
    /** 검증 결과 목록. */
    const validations = ['0', '-1', '1.5'].map((quality) =>
      validateDownloadDraft({ ...baseDraft, quality }),
    );

    expect(validations.map((validation) => validation.kind)).toEqual([
      'invalid',
      'invalid',
      'invalid',
    ]);
  });

  it('rejects filenames that the API refuses', () => {
    /** 검증 결과 목록. */
    const validations = ['../clip', 'clip/name', '..'].map((filename) =>
      validateDownloadDraft({ ...baseDraft, filename }),
    );

    expect(validations.map((validation) => validation.kind)).toEqual([
      'invalid',
      'invalid',
      'invalid',
    ]);
  });

  it('builds an audio download job request', () => {
    /** 생성된 다운로드 job 요청. */
    const request = buildCreateDownloadJobRequest(
      {
        ...baseDraft,
        filename: 'clip',
        quality: '192',
      },
      'http://127.0.0.1:3030',
    );

    expect(request.url).toBe('http://127.0.0.1:3030/downloads');
    expect(request.body).toEqual({
      filename: 'clip',
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

  it('returns a file URL when polling reaches ready status', async () => {
    /** status 조회 mock fetch. */
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          createdAt: '2026-06-23T00:00:00.000Z',
          jobId: 'job-1',
          status: 'ready',
          type: 'audio',
          updatedAt: '2026-06-23T00:00:01.000Z',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        },
      );

    await expect(
      waitForDownloadJobFileUrl(
        {
          createdAt: '2026-06-23T00:00:00.000Z',
          fileUrl: '/downloads/job-1/file',
          jobId: 'job-1',
          status: 'queued',
          statusUrl: '/downloads/job-1',
          type: 'audio',
          updatedAt: '2026-06-23T00:00:00.000Z',
        },
        {
          apiBaseUrl: 'https://mytube-extract.example/api',
          fetcher,
          intervalMs: 0,
        },
      ),
    ).resolves.toBe('https://mytube-extract.example/api/downloads/job-1/file');
  });
});
