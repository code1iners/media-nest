import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { runYoutubeDl } from './youtube-dl-runner';

/** 테스트에서 yt-dlp child process를 대신하는 최소 표면. */
type FakeYoutubeDlProcess = EventEmitter & {
  /** 취소 시 호출 여부. */
  kill: () => void;
  /** stdout stream. */
  stdout: PassThrough;
  /** stderr stream. */
  stderr: PassThrough;
  /** tinyspawn Promise rejection handler. */
  catch: (listener: (error: Error) => void) => void;
};

/** 테스트용 child process를 만든다. */
function createFakeProcess() {
  /** promise rejection listener. */
  let rejectionListener: ((error: Error) => void) | undefined;
  /** 테스트용 child process. */
  const process = Object.assign(new EventEmitter(), {
    catch(listener: (error: Error) => void) {
      rejectionListener = listener;
    },
    kill() {},
    stderr: new PassThrough(),
    stdout: new PassThrough(),
  }) as FakeYoutubeDlProcess;

  return {
    /** tinyspawn Promise rejection을 재현한다. */
    rejectPromise(error: Error) {
      rejectionListener?.(error);
    },
    process,
  };
}

test('non-empty output and close code 0 completes one yt-dlp attempt', async () => {
  /** isolated output directory. */
  const workDir = await mkdtemp(join(tmpdir(), 'media-runner-test-'));
  /** expected final output path. */
  const outputPath = join(workDir, 'output.mp4');
  /** fake child process controls. */
  const fake = createFakeProcess();
  /** runner completion promise. */
  const result = runYoutubeDl({
    execute: () => fake.process,
    outputPath,
    sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
    youtubeOptions: { output: outputPath },
  });

  await writeFile(outputPath, 'video');
  fake.process.emit('close', 0, null);

  await assert.doesNotReject(result);
  await rm(workDir, { force: true, recursive: true });
});

test('non-zero close preserves bounded diagnostic tails', async () => {
  /** fake child process controls. */
  const fake = createFakeProcess();
  /** runner completion promise. */
  const result = runYoutubeDl({
    execute: () => fake.process,
    outputPath: '/tmp/output.mp4',
    sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
    youtubeOptions: { output: '/tmp/output.mp4' },
  });

  fake.process.stderr.write('ERROR: upstream failed\n');
  fake.process.emit('close', 1, null);

  await assert.rejects(result, (error: unknown) => {
    /** runner diagnostic candidate. */
    const diagnostic = (error as { diagnostic?: Record<string, unknown> })
      .diagnostic;

    assert.equal(diagnostic?.exitCode, 1);
    assert.match(String(diagnostic?.stderrTail), /upstream failed/);
    return true;
  });
});

test('close code 0 without a final output rejects instead of creating a false success', async () => {
  /** isolated output directory. */
  const workDir = await mkdtemp(join(tmpdir(), 'media-runner-test-'));
  /** deliberately absent final output path. */
  const outputPath = join(workDir, 'not-created.mp4');
  try {
    /** fake child process controls. */
    const fake = createFakeProcess();
    /** runner completion promise. */
    const result = runYoutubeDl({
      execute: () => fake.process,
      outputPath,
      sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
      youtubeOptions: { output: outputPath },
    });

    fake.process.emit('close', 0, null);

    await assert.rejects(result, (error: unknown) => {
      /** runner diagnostic candidate. */
      const diagnostic = (error as { diagnostic?: Record<string, unknown> })
        .diagnostic;

      assert.equal(diagnostic?.reason, 'output-missing');
      return true;
    });
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }
});

test('promise rejection is handled until close supplies the final process outcome', async () => {
  /** fake child process controls. */
  const fake = createFakeProcess();
  /** runner completion promise. */
  const result = runYoutubeDl({
    execute: () => fake.process,
    outputPath: '/tmp/output.mp4',
    sourceUrl: 'https://www.youtube.com/watch?v=abc123_DEF0',
    youtubeOptions: { output: '/tmp/output.mp4' },
  });

  fake.rejectPromise(new Error('tinyspawn rejection'));
  fake.process.emit('close', 1, null);

  await assert.rejects(result, (error: unknown) => {
    /** runner diagnostic candidate. */
    const diagnostic = (error as { diagnostic?: Record<string, unknown> })
      .diagnostic;

    assert.equal(diagnostic?.exitCode, 1);
    return true;
  });
});
