import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSafeDiagnosticLog } from './media-log-redaction';

test('safe diagnostics redact URLs, query credentials, and local paths', () => {
  /** raw process diagnostic candidate. */
  const error = Object.assign(new Error('raw failure'), {
    diagnostic: {
      stderrTail:
        'https://user:password@example.com/file?token=secret-value failed at /tmp/private/output.mp4',
      tool: 'yt-dlp',
    },
  });
  /** server-safe diagnostic string. */
  const log = createSafeDiagnosticLog(error);

  assert.match(log, /https:\/\/example\.com/);
  assert.doesNotMatch(log, /password|secret-value|\/tmp\/private/);
});
