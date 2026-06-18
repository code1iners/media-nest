import { createSafeErrorLog, redactUrlForLog } from './media-log-redaction';

describe('media log redaction', () => {
  it('keeps only URL scheme and host for logs', () => {
    expect(
      redactUrlForLog('https://user:secret@example.com/watch?v=token'),
    ).toBe('https://example.com');
  });

  it('does not expose error messages or paths as safe error logs', () => {
    expect(createSafeErrorLog(new Error('/tmp/private-path'))).toBe('Error');
  });
});
