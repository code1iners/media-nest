import {
  createSafeDiagnosticLog,
  createSafeErrorLog,
  redactUrlForLog,
} from './media-log-redaction';

describe('media log redaction', () => {
  it('keeps only URL scheme and host for logs', () => {
    expect(
      redactUrlForLog('https://user:secret@example.com/watch?v=token'),
    ).toBe('https://example.com');
  });

  it('does not expose error messages or paths as safe error logs', () => {
    expect(createSafeErrorLog(new Error('/tmp/private-path'))).toBe('Error');
  });

  it('keeps bounded server diagnostics without leaking local paths or tokens', () => {
    /** server-only diagnostic이 붙은 에러. */
    const error = Object.assign(new Error('/tmp/private/raw message'), {
      diagnostic: {
        exitCode: 1,
        killed: false,
        reason: 'youtube-auth-required',
        signal: 'SIGTERM',
        stderrTail:
          'line 1\nERROR: token=secret-value failed at /tmp/private/file.mp3\nline 3',
        stdoutTail: 'download started\n/private/output',
        tool: 'yt-dlp',
      },
    });

    /** 로그에 남길 안전한 진단 문자열. */
    const log = createSafeDiagnosticLog(error);

    expect(log).toContain('tool=yt-dlp');
    expect(log).toContain('reason=youtube-auth-required');
    expect(log).toContain('exitCode=1');
    expect(log).toContain('stderrTail=');
    expect(log).not.toContain('/tmp/private');
    expect(log).not.toContain('/private/output');
    expect(log).not.toContain('secret-value');
  });
});
