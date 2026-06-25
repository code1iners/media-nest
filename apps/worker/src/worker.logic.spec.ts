import assert from 'node:assert/strict';
import { ExtractionType } from '@mytube-extract/db';
import {
  createAssetObjectKey,
  createContentDisposition,
  createContentType,
  createExpiresAt,
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
  createYtDlpFormat(ExtractionType.audio, 'default'),
  'bestaudio/best',
);
assert.equal(
  createYtDlpFormat(ExtractionType.video, '720'),
  'bestvideo[height<=720]+bestaudio/best',
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
