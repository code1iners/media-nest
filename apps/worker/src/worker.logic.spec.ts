import assert from 'node:assert/strict';
import { ExtractionType } from '@mytube-extract/db';
import {
  createAssetObjectKey,
  createContentDisposition,
  createContentType,
  createExpiresAt,
  createVideoPreflightDecision,
  createWorkerHeartbeatUpsertArgs,
  createYtDlpFormat,
  normalizeExtractedAssetTitle,
  parseEnvNumber,
} from './worker.logic';

assert.equal(
  createAssetObjectKey('dQw4w9WgXcQ', ExtractionType.audio, '192'),
  'extracts/dQw4w9WgXcQ/audio-192.mp3',
);
assert.equal(
  createAssetObjectKey('dQw4w9WgXcQ', ExtractionType.video, '720'),
  'extracts/dQw4w9WgXcQ/video-720.mp4',
);
assert.equal(
  createYtDlpFormat(ExtractionType.audio, '320'),
  'bestaudio[abr<=320]/best',
);
assert.equal(
  createYtDlpFormat(ExtractionType.video, '1080'),
  'bestvideo[height<=1080]+bestaudio/best',
);
assert.equal(
  createYtDlpFormat(ExtractionType.video, '720'),
  'bestvideo[height<=720]+bestaudio/best',
);
assert.deepEqual(
  createVideoPreflightDecision(
    {
      requested_formats: [
        { filesize: 485_832_684, format_id: '399' },
        { filesize: 205_557_300, format_id: '251' },
      ],
    },
    1024 * 1024 * 1024,
  ),
  {
    estimatedBytes: 691_389_984,
    formatIds: ['399', '251'],
    ok: true,
  },
);
assert.deepEqual(
  createVideoPreflightDecision(
    {
      requested_formats: [
        { filesize: 2_201_425_722, format_id: '401' },
        { filesize: 205_557_300, format_id: '251' },
      ],
    },
    1024 * 1024 * 1024,
  ),
  {
    errorCode: 'VIDEO_TOO_LARGE',
    estimatedBytes: 2_406_983_022,
    formatIds: ['401', '251'],
    message: 'selected video is too large: 2406983022 bytes',
    ok: false,
  },
);
assert.deepEqual(createVideoPreflightDecision({}), {
  errorCode: 'YOUTUBE_FORMAT_UNAVAILABLE',
  estimatedBytes: null,
  formatIds: [],
  message: 'yt-dlp did not return selected video formats',
  ok: false,
});
assert.deepEqual(
  createVideoPreflightDecision(
    {
      requested_formats: [
        { filesize: 485_832_684, format_id: '399' },
        { format_id: '251' },
      ],
    },
    1024 * 1024 * 1024,
  ),
  {
    errorCode: 'YOUTUBE_FORMAT_UNAVAILABLE',
    estimatedBytes: null,
    formatIds: ['399', '251'],
    message: 'yt-dlp selected video formats without complete size metadata',
    ok: false,
  },
);
assert.equal(createContentType(ExtractionType.audio), 'audio/mpeg');
assert.equal(
  createContentDisposition('extracts/dQw4w9WgXcQ/audio-192.mp3'),
  'attachment; filename="audio-192.mp3"; filename*=UTF-8\'\'audio-192.mp3',
);
assert.equal(parseEnvNumber('abc', 60_000), 60_000);
assert.equal(
  normalizeExtractedAssetTitle('  Never Gonna Give You Up  '),
  'Never Gonna Give You Up',
);
assert.equal(normalizeExtractedAssetTitle('   '), null);
assert.equal(
  createExpiresAt(7, new Date('2026-06-24T00:00:00.000Z')).toISOString(),
  '2026-07-01T00:00:00.000Z',
);
assert.deepEqual(
  createWorkerHeartbeatUpsertArgs(new Date('2026-06-25T00:00:00.000Z')),
  {
    create: {
      id: 'default',
      lastSeenAt: new Date('2026-06-25T00:00:00.000Z'),
    },
    update: {
      lastSeenAt: new Date('2026-06-25T00:00:00.000Z'),
    },
    where: {
      id: 'default',
    },
  },
);
