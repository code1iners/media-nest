import { describe, expect, it } from 'vitest';
import {
  mergeStoredDownloadOptions,
  normalizeApiBaseUrl,
} from '../../src/domain/download-options/download-options';
import { detectYoutubeVideoId } from '../../src/domain/youtube/youtube-url';
import { buildDownloadUrl, buildHealthUrl } from '../../src/services/media-nest/download-url';

describe('download URL behavior', () => {
  it('detects an 11-character video ID from YouTube watch URLs', () => {
    expect(detectYoutubeVideoId('https://www.youtube.com/watch?v=abc123_DEF0')?.videoId).toBe(
      'abc123_DEF0',
    );
    expect(detectYoutubeVideoId('https://youtube.com/watch?v=abc123_DEF0')?.videoId).toBe(
      'abc123_DEF0',
    );
  });

  it('ignores extra YouTube query parameters when detecting the video ID', () => {
    expect(
      detectYoutubeVideoId('https://www.youtube.com/watch?v=abc123_DEF0&t=10s&feature=share')
        ?.videoId,
    ).toBe('abc123_DEF0');
  });

  it('rejects unsupported or malformed current tab URLs', () => {
    expect(detectYoutubeVideoId('https://example.com/watch?v=abc123_DEF0')).toBeNull();
    expect(detectYoutubeVideoId('https://www.youtube.com/feed/subscriptions')).toBeNull();
    expect(detectYoutubeVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
  });

  it('normalizes API base URLs before building download URLs', () => {
    expect(normalizeApiBaseUrl(' http://127.0.0.1:3030/ ')).toBe('http://127.0.0.1:3030');
  });

  it('builds an audio download URL with optional query values', () => {
    expect(
      buildDownloadUrl({
        apiBaseUrl: 'http://127.0.0.1:3030',
        bitrate: '320',
        filename: 'sample audio',
        mode: 'audio',
        resolution: '',
        videoId: 'abc123_DEF0',
      }),
    ).toBe('http://127.0.0.1:3030/audio/abc123_DEF0?filename=sample+audio&bitrate=320');
  });

  it('builds a video download URL and omits empty optional query values', () => {
    expect(
      buildDownloadUrl({
        apiBaseUrl: 'http://127.0.0.1:3030/',
        bitrate: '',
        filename: '',
        mode: 'video',
        resolution: '',
        videoId: 'abc123_DEF0',
      }),
    ).toBe('http://127.0.0.1:3030/video/abc123_DEF0');
  });

  it('builds the API health URL from the same base URL normalization', () => {
    expect(buildHealthUrl('http://127.0.0.1:3030/')).toBe('http://127.0.0.1:3030/health');
  });

  it('keeps storage key compatibility while normalizing saved mode', () => {
    expect(mergeStoredDownloadOptions({ mode: 'video', filename: 'saved' })).toMatchObject({
      apiBaseUrl: 'http://127.0.0.1:3030',
      filename: 'saved',
      mode: 'video',
    });
    expect(mergeStoredDownloadOptions({ mode: 'invalid' as never }).mode).toBe('audio');
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
        videoId: 'short',
      }),
    ).toThrow('A valid YouTube video ID is required');
  });
});
