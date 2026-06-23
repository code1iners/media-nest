import { describe, expect, it } from 'vitest';
import {
  type DownloadDraft,
  buildDownloadUrl,
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

  it('builds an audio API URL', () => {
    /** 생성된 다운로드 URL. */
    const downloadUrl = new URL(
      buildDownloadUrl(
        {
          ...baseDraft,
          filename: 'clip',
          quality: '192',
        },
        'http://127.0.0.1:3030',
      ),
    );

    expect(downloadUrl.origin).toBe('http://127.0.0.1:3030');
    expect(downloadUrl.pathname).toBe('/audio');
    expect(downloadUrl.searchParams.get('url')).toBe(baseDraft.sourceUrl);
    expect(downloadUrl.searchParams.get('filename')).toBe('clip');
    expect(downloadUrl.searchParams.get('bitrate')).toBe('192');
  });

  it('builds a video API URL', () => {
    /** 생성된 다운로드 URL. */
    const downloadUrl = new URL(
      buildDownloadUrl(
        {
          ...baseDraft,
          mode: 'video',
          quality: '720',
        },
        'https://mytube-extract.example',
      ),
    );

    expect(downloadUrl.pathname).toBe('/video');
    expect(downloadUrl.searchParams.get('resolution')).toBe('720');
  });

  it('uses the configured API base URL without dropping its path', () => {
    /** 생성된 다운로드 URL. */
    const downloadUrl = new URL(buildDownloadUrl(baseDraft, 'https://mytube-extract.example/api/'));

    expect(downloadUrl.origin).toBe('https://mytube-extract.example');
    expect(downloadUrl.pathname).toBe('/api/audio');
  });

});
