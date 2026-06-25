import { describe, expect, it } from 'vitest';
import {
  type DownloadDraft,
  isTerminalStatus,
  validateDownloadDraft,
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

  it('keeps terminal status logic in the domain layer', () => {
    expect(isTerminalStatus('queued')).toBe(false);
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('expired')).toBe(true);
  });
});
