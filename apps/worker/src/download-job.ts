import { ExtractionType } from '@mytube-extract/db';
import {
  getDownloaderDiagnostic,
  runYoutubeDl,
  type YoutubeDlExecute,
  type YoutubeDlRunInput,
} from '@mytube-extract/media-downloader';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** worker가 transient extraction 실패를 다시 실행하는 총 시도 횟수. */
const EXTRACTION_ATTEMPTS = 2;

/** 첫 extraction 실패 후 같은 partial state를 재사용하기 전 대기 시간. */
const RETRY_DELAY_MS = 500;

/** yt-dlp 실행 함수를 대체할 수 있는 test seam. */
type YoutubeDlRun = (input: YoutubeDlRunInput) => Promise<void>;

/** worker extraction artifact를 만드는 입력. */
export type DownloadExtractionJobInput = {
  /** worker가 처리할 canonical YouTube URL. */
  sourceUrl: string;
  /** 결과 artifact type. */
  type: ExtractionType;
  /** youtube-dl-exec process를 시작하는 함수. */
  execute: YoutubeDlExecute;
  /** output path에 맞춰 yt-dlp 옵션을 만드는 함수. */
  createYoutubeOptions: (outputPath: string) => Record<string, unknown>;
  /** 테스트에서 대체 가능한 단일-attempt runner. */
  run?: YoutubeDlRun;
  /** retry delay를 대체하는 테스트 seam. */
  wait?: (milliseconds: number) => Promise<void>;
  /** 재시도 직전 server-safe log를 남길 worker callback. */
  onRetry?: (input: { attempt: number; error: unknown }) => void;
};

/** 실제 extraction에 성공한 final artifact path를 반환한다. */
export async function downloadExtractionJob(
  input: DownloadExtractionJobInput,
) {
  /** 요청별 worker 임시 디렉터리. */
  const workDir = await mkdtemp(join(tmpdir(), `mytube-worker-${input.type}-`));
  /** 출력 파일 확장자. */
  const extension = input.type === ExtractionType.audio ? 'mp3' : 'mp4';
  /** yt-dlp final artifact 경로. */
  const outputPath = resolve(workDir, `output.${extension}`);
  /** 사용할 single-attempt runner. */
  const run = input.run ?? runYoutubeDl;
  /** 재시도 대기 함수. */
  const wait = input.wait ?? sleep;

  try {
    for (let attempt = 1; attempt <= EXTRACTION_ATTEMPTS; attempt += 1) {
      try {
        await run({
          execute: input.execute,
          outputPath,
          sourceUrl: input.sourceUrl,
          youtubeOptions: input.createYoutubeOptions(outputPath),
        });

        return outputPath;
      } catch (error) {
        if (attempt >= EXTRACTION_ATTEMPTS || !isRetryableExtractionFailure(error)) {
          throw error;
        }

        // yt-dlp resume data는 남기고 손상됐을 수 있는 final artifact만 제거한다.
        await rm(outputPath, { force: true });
        input.onRetry?.({ attempt, error });
        await wait(RETRY_DELAY_MS);
      }
    }

    throw new Error('yt-dlp extraction did not settle');
  } catch (error) {
    await rm(workDir, { force: true, recursive: true });
    throw error;
  }
}

/** worker가 같은 partial state로 한 번 더 시도할 수 있는 오류인지 판별한다. */
function isRetryableExtractionFailure(error: unknown) {
  /** 공통 runner가 수집한 structured diagnostic. */
  const diagnostic = getDownloaderDiagnostic(error);

  return !(
    diagnostic?.killed ||
    diagnostic?.signal ||
    diagnostic?.reason === 'aborted' ||
    diagnostic?.reason === 'spawn-failed' ||
    diagnostic?.reason === 'youtube-auth-required'
  );
}

/** 지정 시간만큼 기다린다. */
function sleep(milliseconds: number) {
  return new Promise<void>((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}
