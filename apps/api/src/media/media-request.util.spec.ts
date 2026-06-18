import { BadRequestException } from '@nestjs/common';
import {
  createYoutubeWatchUrl,
  normalizeDownloadName,
  normalizeSourceUrl,
  parseAudioIdRequest,
  parseAudioUrlRequest,
  parsePositiveInteger,
  parseVideoIdRequest,
  parseVideoUrlRequest,
} from './media-request.util';

describe('media request utilities', () => {
  describe('normalizeDownloadName', () => {
    it('trims a valid download filename', () => {
      expect(normalizeDownloadName('  sample media  ')).toBe('sample media');
    });

    it.each(['', '   ', '.', '..', 'nested/file', 'nested\\file', 'bad\nfile'])(
      'rejects unsafe download filename %p',
      (filename) => {
        expect(() => normalizeDownloadName(filename)).toThrow(
          BadRequestException,
        );
      },
    );
  });

  describe('parsePositiveInteger', () => {
    it.each([undefined, null, ''])(
      'treats optional numeric value %p as omitted',
      (value) => {
        expect(parsePositiveInteger(value, 'bitrate')).toBeUndefined();
      },
    );

    it.each([
      ['320', 320],
      [720, 720],
    ])('parses positive integer value %p', (value, expected) => {
      expect(parsePositiveInteger(value, 'resolution')).toBe(expected);
    });

    it.each(['0', '-1', '1.5', 'NaN'])(
      'rejects invalid positive integer value %p',
      (value) => {
        expect(() => parsePositiveInteger(value, 'bitrate')).toThrow(
          'bitrate must be a positive integer',
        );
      },
    );
  });

  describe('normalizeSourceUrl', () => {
    it('normalizes http and https URLs', () => {
      expect(normalizeSourceUrl('https://example.com/watch?v=1')).toBe(
        'https://example.com/watch?v=1',
      );
    });

    it.each(['ftp://example.com/file.mp4', 'not-a-url', undefined])(
      'rejects unsupported source URL %p',
      (url) => {
        expect(() => normalizeSourceUrl(url)).toThrow(BadRequestException);
      },
    );
  });

  describe('createYoutubeWatchUrl', () => {
    it('creates a YouTube watch URL from an 11 character video id', () => {
      expect(createYoutubeWatchUrl('abc123_DEF0')).toBe(
        'https://www.youtube.com/watch?v=abc123_DEF0',
      );
    });

    it('rejects invalid YouTube video ids', () => {
      expect(() => createYoutubeWatchUrl('short')).toThrow(
        'id must be a valid YouTube video id',
      );
    });
  });

  describe('request parsers', () => {
    it('creates a validated audio request from a URL query', () => {
      expect(
        parseAudioUrlRequest({
          bitrate: '320',
          filename: ' sample ',
          url: 'https://example.com/watch?v=secret',
        }),
      ).toEqual({
        bitrate: 320,
        filename: 'sample',
        source: {
          kind: 'url',
          safeLabel: 'https://example.com',
          url: 'https://example.com/watch?v=secret',
        },
      });
    });

    it('creates a validated audio request from a YouTube id path', () => {
      expect(
        parseAudioIdRequest('abc123_DEF0', { filename: 'sample' }),
      ).toEqual({
        bitrate: undefined,
        filename: 'sample',
        source: {
          kind: 'youtube-id',
          safeLabel: 'youtube:abc123_DEF0',
          url: 'https://www.youtube.com/watch?v=abc123_DEF0',
        },
      });
    });

    it('creates a validated video request from a URL query', () => {
      expect(
        parseVideoUrlRequest({
          filename: 'sample',
          resolution: '720',
          url: 'https://example.com/watch?v=secret',
        }),
      ).toEqual({
        filename: 'sample',
        resolution: 720,
        source: {
          kind: 'url',
          safeLabel: 'https://example.com',
          url: 'https://example.com/watch?v=secret',
        },
      });
    });

    it('creates a validated video request from a YouTube id path', () => {
      expect(
        parseVideoIdRequest('abc123_DEF0', { filename: 'sample' }),
      ).toEqual({
        filename: 'sample',
        resolution: undefined,
        source: {
          kind: 'youtube-id',
          safeLabel: 'youtube:abc123_DEF0',
          url: 'https://www.youtube.com/watch?v=abc123_DEF0',
        },
      });
    });
  });
});
