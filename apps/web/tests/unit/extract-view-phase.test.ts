import { describe, expect, it } from 'vitest';
import { getExtractViewPhase } from '../../src/app/utils/extract-view-phase.util';

describe('extract view phase', () => {
  it('shows only the request form before a job exists', () => {
    expect(getExtractViewPhase({ status: null })).toBe('request');
  });

  it('shows processing while a submitted job is non-terminal', () => {
    expect(getExtractViewPhase({ status: 'queued' })).toBe('processing');
    expect(getExtractViewPhase({ status: 'transcribing' })).toBe('processing');
  });

  it('shows processing from submission until the API creates a job', () => {
    expect(
      getExtractViewPhase({
        isSubmitting: true,
        status: null,
      }),
    ).toBe('processing');
  });

  it('shows the result only for a completed job', () => {
    expect(getExtractViewPhase({ status: 'completed' })).toBe('result');
  });

  it('prioritizes errors over a stale job status', () => {
    expect(
      getExtractViewPhase({
        hasRequestError: true,
        status: 'processing',
      }),
    ).toBe('error');
    expect(getExtractViewPhase({ status: 'failed' })).toBe('error');
    expect(getExtractViewPhase({ status: 'expired' })).toBe('error');
  });

  it('keeps request settings visible when health fails before submission', () => {
    expect(
      getExtractViewPhase({
        hasWorkerHealthError: true,
        status: null,
      }),
    ).toBe('request');
    expect(
      getExtractViewPhase({
        hasActiveJob: true,
        hasWorkerHealthError: true,
        status: 'processing',
      }),
    ).toBe('error');
    expect(
      getExtractViewPhase({
        hasActiveJob: true,
        hasWorkerHealthError: true,
        status: 'completed',
      }),
    ).toBe('result');
  });
});
