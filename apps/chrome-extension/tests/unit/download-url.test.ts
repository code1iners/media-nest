import { describe, expect, it } from 'vitest';
import {
  mergeStoredDownloadOptions,
  normalizeApiBaseUrl,
  normalizeSourceUrl,
} from '../../src/domain/download-options/download-options';
import { buildDownloadUrl, buildHealthUrl } from '../../src/services/mytube-extract/download-url';
import { resolveDefaultApiBaseUrl } from '../../src/shared/constants';

describe('download URL behavior', () => {
  it('normalizes API base URLs before building download URLs', () => {
    expect(normalizeApiBaseUrl(' http://127.0.0.1:3030/ ')).toBe('http://127.0.0.1:3030');
  });

  it('normalizes source URLs before building download URLs', () => {
    expect(normalizeSourceUrl(' https://www.youtube.com/watch?v=abc123_DEF0 ')).toBe(
      'https://www.youtube.com/watch?v=abc123_DEF0',
    );
    expect(normalizeSourceUrl('https://youtube.com/watch?v=abc123_DEF0&t=10s')).toBe(
      'https://youtube.com/watch?v=abc123_DEF0&t=10s',
    );
    expect(normalizeSourceUrl('https://youtu.be/abc123_DEF0')).toBe(
      'https://www.youtube.com/watch?v=abc123_DEF0',
    );
    expect(normalizeSourceUrl('https://www.youtube.com/shorts/abc123_DEF0')).toBe(
      'https://www.youtube.com/watch?v=abc123_DEF0',
    );
  });

  it('builds an audio download URL with optional query values', () => {
    expect(
      buildDownloadUrl({
        apiBaseUrl: 'http://127.0.0.1:3030',
        bitrate: '320',
        filename: 'sample audio',
        mode: 'audio',
        resolution: '',
        sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
      }),
    ).toBe(
      'http://127.0.0.1:3030/audio?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123_DEF0&filename=sample+audio&bitrate=320',
    );
  });

  it('builds a video download URL and omits empty optional query values', () => {
    expect(
      buildDownloadUrl({
        apiBaseUrl: 'http://127.0.0.1:3030/',
        bitrate: '',
        filename: '',
        mode: 'video',
        resolution: '',
        sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
      }),
    ).toBe('http://127.0.0.1:3030/video?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123_DEF0');
  });

  it('builds the API health URL from the same base URL normalization', () => {
    expect(buildHealthUrl('http://127.0.0.1:3030/')).toBe('http://127.0.0.1:3030/health');
  });

  it('keeps storage compatibility while ignoring saved API and source URLs', () => {
    expect(
      mergeStoredDownloadOptions({
        apiBaseUrl: 'http://127.0.0.1:3030',
        filename: 'saved',
        mode: 'video',
        sourceUrl: 'https://example.com/private',
      } as never),
    ).toMatchObject({
      apiBaseUrl: 'https://media-nest.codeliners.cc',
      filename: 'saved',
      mode: 'video',
      sourceUrl: '',
    });
    expect(mergeStoredDownloadOptions({ mode: 'invalid' as never }).mode).toBe('audio');
  });

  it('resolves API base URLs from WXT environment values', () => {
    expect(resolveDefaultApiBaseUrl(' http://127.0.0.1:3030 ')).toBe('http://127.0.0.1:3030');
    expect(resolveDefaultApiBaseUrl(undefined)).toBe('https://media-nest.codeliners.cc');
  });

  it('rejects unsupported API protocols and invalid download inputs', () => {
    expect(() => normalizeApiBaseUrl('ftp://127.0.0.1')).toThrow(
      'API base URL must use http or https',
    );
    expect(() =>
      buildDownloadUrl({
        apiBaseUrl: 'http://127.0.0.1:3030',
        bitrate: '',
        filename: '',
        mode: 'audio',
        resolution: '',
        sourceUrl: 'not-a-url',
      }),
    ).toThrow('A valid source URL is required');
    expect(() => normalizeSourceUrl('ftp://www.youtube.com/watch?v=abc123_DEF0')).toThrow(
      'YouTube watch URL is required',
    );
    expect(() => normalizeSourceUrl('https://example.com/watch?v=abc123_DEF0')).toThrow(
      'YouTube watch URL is required',
    );
    expect(() => normalizeSourceUrl('https://youtu.be/invalid')).toThrow(
      'YouTube watch URL is required',
    );
    expect(() => normalizeSourceUrl('https://www.youtube.com/shorts/invalid')).toThrow(
      'YouTube watch URL is required',
    );
  });
});
