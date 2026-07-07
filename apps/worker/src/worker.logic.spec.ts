import assert from 'node:assert/strict';
import { ExtractionType, SubtitleJobStatus } from '@mytube-extract/db';
import {
  appendProcessOutputTail,
  createAssetObjectKey,
  createContentDisposition,
  createContentType,
  createExpiresAt,
  createSubtitleContentType,
  createSubtitleMessage,
  createSubtitleProgress,
  createSubtitleResultObjectKey,
  createWhisperCliArgs,
  createWhisperModelEnvName,
  createWhisperSrtOutputPath,
  createVideoPreflightDecision,
  createWorkerHeartbeatUpsertArgs,
  createYtDlpFormat,
  DEFAULT_SUBTITLE_AUDIO_MAX_BYTES,
  normalizeSubtitleWorkerFailureCode,
  normalizeWhisperSrt,
  normalizeExtractedAssetTitle,
  parseEnvNumber,
  selectNextQueuedWorkerJob,
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
assert.equal(
  createSubtitleResultObjectKey('job-1'),
  'subtitles/job-1/english.srt',
);
assert.equal(
  createSubtitleContentType(),
  'application/x-subrip; charset=utf-8',
);
assert.equal(DEFAULT_SUBTITLE_AUDIO_MAX_BYTES, 536_870_912);
assert.equal(appendProcessOutputTail('abc', 'def', 10), 'abcdef');
assert.equal(appendProcessOutputTail('abc', 'def', 4), 'cdef');
assert.deepEqual(
  createWhisperCliArgs({
    audioPath: '/tmp/audio.wav',
    language: 'en',
    modelPath: '/models/ggml-medium.en.bin',
    outputBasePath: '/tmp/english',
    threads: 4,
  }),
  [
    '-m',
    '/models/ggml-medium.en.bin',
    '-f',
    '/tmp/audio.wav',
    '-l',
    'en',
    '-np',
    '-osrt',
    '-of',
    '/tmp/english',
    '-t',
    '4',
  ],
);
assert.deepEqual(
  createWhisperCliArgs({
    audioPath: '/tmp/audio.wav',
    language: 'en',
    modelPath: '/models/ggml-medium.en.bin',
    outputBasePath: '/tmp/english',
  }),
  [
    '-m',
    '/models/ggml-medium.en.bin',
    '-f',
    '/tmp/audio.wav',
    '-l',
    'en',
    '-np',
    '-osrt',
    '-of',
    '/tmp/english',
  ],
);
assert.equal(
  createWhisperModelEnvName('base_en'),
  'WHISPER_MODEL_BASE_EN_PATH',
);
assert.equal(
  createWhisperModelEnvName('small_en'),
  'WHISPER_MODEL_SMALL_EN_PATH',
);
assert.equal(createWhisperModelEnvName('large_en'), null);
assert.equal(createWhisperSrtOutputPath('/tmp/english'), '/tmp/english.srt');
assert.equal(
  normalizeWhisperSrt('  1\n00:00:00,000 --> 00:00:01,000\nHello\n\n'),
  '1\n00:00:00,000 --> 00:00:01,000\nHello\n',
);
assert.throws(() => normalizeWhisperSrt('   '), {
  message: 'whisper.cpp generated an empty SRT file',
});
assert.equal(
  normalizeSubtitleWorkerFailureCode('TRANSCRIPTION_FAILED'),
  'TRANSCRIPTION_FAILED',
);
assert.equal(
  normalizeSubtitleWorkerFailureCode('CLI_EXITED'),
  'TRANSCRIPTION_FAILED',
);
assert.equal(createSubtitleProgress(SubtitleJobStatus.queued), 10);
assert.equal(createSubtitleProgress(SubtitleJobStatus.extracting_audio), 40);
assert.equal(createSubtitleProgress(SubtitleJobStatus.transcribing), 70);
assert.equal(createSubtitleProgress(SubtitleJobStatus.completed), 100);
assert.equal(createSubtitleProgress(SubtitleJobStatus.failed), null);
assert.equal(
  createSubtitleMessage(SubtitleJobStatus.transcribing),
  '영어 자막을 생성하고 있습니다.',
);
assert.equal(
  createSubtitleMessage(SubtitleJobStatus.failed, 'AUDIO_TOO_LARGE'),
  '추출된 음성 파일이 커서 현재 설정으로 처리할 수 없습니다.',
);
assert.deepEqual(
  selectNextQueuedWorkerJob({
    downloadJob: {
      createdAt: new Date('2026-07-07T00:00:20.000Z'),
      id: 'download-1',
    },
    subtitleJob: {
      createdAt: new Date('2026-07-07T00:00:10.000Z'),
      id: 'subtitle-1',
    },
  }),
  {
    createdAt: new Date('2026-07-07T00:00:10.000Z'),
    id: 'subtitle-1',
    kind: 'subtitle',
  },
);
assert.deepEqual(
  selectNextQueuedWorkerJob({
    downloadJob: {
      createdAt: new Date('2026-07-07T00:00:10.000Z'),
      id: 'download-1',
    },
    subtitleJob: {
      createdAt: new Date('2026-07-07T00:00:20.000Z'),
      id: 'subtitle-1',
    },
  }),
  {
    createdAt: new Date('2026-07-07T00:00:10.000Z'),
    id: 'download-1',
    kind: 'download',
  },
);
assert.deepEqual(
  selectNextQueuedWorkerJob({
    downloadJob: {
      createdAt: new Date('2026-07-07T00:00:10.000Z'),
      id: 'download-1',
    },
    subtitleJob: {
      createdAt: new Date('2026-07-07T00:00:10.000Z'),
      id: 'subtitle-1',
    },
  }),
  {
    createdAt: new Date('2026-07-07T00:00:10.000Z'),
    id: 'download-1',
    kind: 'download',
  },
);
assert.deepEqual(
  selectNextQueuedWorkerJob({
    downloadJob: null,
    subtitleJob: {
      createdAt: new Date('2026-07-07T00:00:10.000Z'),
      id: 'subtitle-1',
    },
  }),
  {
    createdAt: new Date('2026-07-07T00:00:10.000Z'),
    id: 'subtitle-1',
    kind: 'subtitle',
  },
);
assert.deepEqual(
  selectNextQueuedWorkerJob({
    downloadJob: {
      createdAt: new Date('2026-07-07T00:00:10.000Z'),
      id: 'download-1',
    },
    subtitleJob: null,
  }),
  {
    createdAt: new Date('2026-07-07T00:00:10.000Z'),
    id: 'download-1',
    kind: 'download',
  },
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
