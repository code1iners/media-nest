import { describe, expect, it } from 'vitest';
import {
  type DownloadDraft,
  AUDIO_QUALITY_OPTIONS,
  INITIAL_DOWNLOAD_DRAFT,
  VIDEO_QUALITY_OPTIONS,
  getDefaultDownloadQuality,
  isTerminalStatus,
  validateDownloadDraft,
} from '../../src/domain/download-request/download-request';

/** 테스트용 기본 다운로드 입력값. */
const baseDraft: DownloadDraft = {
  mode: 'audio',
  quality: '320',
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

  it('uses explicit maximum quality defaults instead of a default option', () => {
    /** 화면에 노출되는 audio 품질 값. */
    const audioQualities = AUDIO_QUALITY_OPTIONS.map((option) => option.value);
    /** 화면에 노출되는 video 품질 값. */
    const videoQualities = VIDEO_QUALITY_OPTIONS.map((option) => option.value);

    expect(INITIAL_DOWNLOAD_DRAFT).toMatchObject({
      mode: 'audio',
      quality: '320',
    });
    expect(audioQualities).toEqual(['128', '192', '320']);
    expect(videoQualities).toEqual(['360', '720', '1080']);
    expect(getDefaultDownloadQuality('audio')).toBe('320');
    expect(getDefaultDownloadQuality('video')).toBe('1080');
    expect(validateDownloadDraft(baseDraft).kind).toBe('ready');
    expect(
      validateDownloadDraft({
        ...baseDraft,
        mode: 'video',
        quality: '1080',
      }).kind,
    ).toBe('ready');
  });

  it('keeps terminal status logic in the domain layer', () => {
    expect(isTerminalStatus('queued')).toBe(false);
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('expired')).toBe(true);
  });
});
