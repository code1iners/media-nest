import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import type {
  YoutubeDlExecute,
  YoutubeDlRunInput,
} from '@mytube-extract/media-downloader';
import { downloadExtractionJob } from './download-job';

/** yt-dlp 오류에 붙일 테스트용 diagnostic. */
function createFailure(reason?: string) {
  return Object.assign(new Error('yt-dlp failed'), {
    diagnostic: {
      ...(reason ? { reason } : {}),
      tool: 'yt-dlp',
    },
  });
}

/** fake runner test에서는 호출되지 않아야 하는 yt-dlp process starter. */
const unusedExecute = (() => {
  throw new Error('fake runner must not execute yt-dlp');
}) as unknown as YoutubeDlExecute;

test('retries one transient failure with the same output path and preserves partial files', async () => {
  /** runner 입력 기록. */
  const attempts: YoutubeDlRunInput[] = [];
  /** retry 대기 호출 횟수. */
  let waitCalls = 0;

  /** 성공한 extraction artifact. */
  const outputPath = await downloadExtractionJob({
    createYoutubeOptions: (path) => ({ output: path }),
    execute: unusedExecute,
    run: async (input) => {
      attempts.push(input);

      if (attempts.length === 1) {
        await writeFile(input.outputPath, 'invalid final output');
        await writeFile(`${input.outputPath}.part`, 'partial bytes');
        throw createFailure();
      }

      assert.equal(existsSync(input.outputPath), false);
      assert.equal(existsSync(`${input.outputPath}.part`), true);
      await writeFile(input.outputPath, 'valid final output');
    },
    sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
    type: 'video',
    wait: async () => {
      waitCalls += 1;
    },
  });

  assert.equal(attempts.length, 2);
  assert.equal(waitCalls, 1);
  assert.equal(attempts[0]?.outputPath, attempts[1]?.outputPath);
  assert.equal(basename(outputPath), 'output.mp4');
  assert.equal(existsSync(outputPath), true);

  await rm(dirname(outputPath), { force: true, recursive: true });
});

test('does not retry a YouTube auth failure and removes its work directory', async () => {
  /** runner invocation count. */
  let runCalls = 0;
  /** discovered work directory. */
  let workDir = '';

  await assert.rejects(
    downloadExtractionJob({
      createYoutubeOptions: (path) => ({ output: path }),
      execute: unusedExecute,
      run: async (input) => {
        runCalls += 1;
        workDir = dirname(input.outputPath);
        throw createFailure('youtube-auth-required');
      },
      sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
      type: 'audio',
    }),
  );

  assert.equal(runCalls, 1);
  assert.equal(existsSync(workDir), false);
});

test('removes the work directory after two retryable failures', async () => {
  /** runner invocation count. */
  let runCalls = 0;
  /** discovered work directory. */
  let workDir = '';

  await assert.rejects(
    downloadExtractionJob({
      createYoutubeOptions: (path) => ({ output: path }),
      execute: unusedExecute,
      run: async (input) => {
        runCalls += 1;
        workDir = dirname(input.outputPath);
        await writeFile(join(workDir, 'output.mp4.part'), 'partial bytes');
        throw createFailure();
      },
      sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
      type: 'video',
      wait: async () => undefined,
    }),
  );

  assert.equal(runCalls, 2);
  assert.equal(existsSync(workDir), false);
});
