import { GoneException, NotFoundException } from '@nestjs/common';
import { MediaDownloadJobService } from './media-download-job.service';
import { MediaDownloadPolicy } from './media-download-policy';
import { MediaDownloadService } from './media-download.service';
import {
  MediaDownloadArtifact,
  MediaDownloadJob,
} from './media-download.types';

/** pending promise 제어 핸들. */
type Deferred<T> = {
  /** promise 인스턴스. */
  promise: Promise<T>;
  /** promise 성공 resolver. */
  resolve: (value: T) => void;
  /** promise 실패 rejecter. */
  reject: (error: Error) => void;
};

/** microtask와 promise callback을 비운다. */
function flushAsync() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

/** 테스트용 pending promise를 만든다. */
function createDeferred<T>(): Deferred<T> {
  /** 성공 resolver. */
  let resolve: (value: T) => void = () => undefined;
  /** 실패 rejecter. */
  let reject: (error: Error) => void = () => undefined;
  /** 제어할 promise. */
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

describe('MediaDownloadJobService', () => {
  let service: MediaDownloadJobService;

  const mediaDownloadServiceMock = {
    download: jest.fn(),
  };
  const policyMock = {
    getConfig: jest.fn(),
  };
  const baseJob: MediaDownloadJob = {
    contentType: 'audio/mpeg',
    downloadName: 'sample.mp3',
    failureMessage: 'Error generating audio file',
    format: 'bestaudio/best',
    kind: 'audio',
    source: {
      kind: 'url',
      safeLabel: 'https://example.com',
      url: 'https://example.com/video',
    },
  };

  function createArtifact(cleanup = jest.fn()): MediaDownloadArtifact {
    return {
      cleanup,
      contentType: 'audio/mpeg',
      downloadName: 'sample.mp3',
      filePath: '/tmp/sample.mp3',
      kind: 'audio',
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    policyMock.getConfig.mockReturnValue({});
    mediaDownloadServiceMock.download.mockResolvedValue(createArtifact());
    service = new MediaDownloadJobService(
      mediaDownloadServiceMock as unknown as MediaDownloadService,
      policyMock as unknown as MediaDownloadPolicy,
    );
  });

  it('creates a queued job before the async worker starts', async () => {
    /** 생성 직후 job snapshot. */
    const snapshot = service.create(baseJob);

    expect(snapshot.status).toBe('queued');
    expect(snapshot.type).toBe('audio');

    await flushAsync();
  });

  it('runs queued jobs in FIFO order within the concurrency limit', async () => {
    /** 첫 번째 다운로드 pending 제어 핸들. */
    const first = createDeferred<MediaDownloadArtifact>();
    /** 두 번째 다운로드 pending 제어 핸들. */
    const second = createDeferred<MediaDownloadArtifact>();
    policyMock.getConfig.mockReturnValue({ concurrencyLimit: 1 });
    mediaDownloadServiceMock.download
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    /** 첫 번째 job. */
    const firstJob = service.create(baseJob);
    /** 두 번째 job. */
    const secondJob = service.create(baseJob);

    await flushAsync();

    expect(service.get(firstJob.jobId).status).toBe('running');
    expect(service.get(secondJob.jobId).status).toBe('queued');

    first.resolve(createArtifact());
    await flushAsync();
    await flushAsync();

    expect(service.get(secondJob.jobId).status).toBe('running');

    second.resolve(createArtifact());
    await flushAsync();
  });

  it('stores a ready artifact when the download succeeds', async () => {
    /** 생성된 job. */
    const snapshot = service.create(baseJob);

    await flushAsync();

    expect(service.get(snapshot.jobId).status).toBe('ready');
  });

  it('keeps failed job responses client safe', async () => {
    mediaDownloadServiceMock.download.mockRejectedValueOnce(
      new Error('/tmp/private/raw stderr'),
    );

    /** 실패할 job. */
    const snapshot = service.create(baseJob);

    await flushAsync();

    expect(service.get(snapshot.jobId)).toMatchObject({
      message: '다운로드 작업에 실패했습니다.',
      status: 'failed',
    });
    expect(service.get(snapshot.jobId).message).not.toContain('/tmp/private');
  });

  it('cancels queued jobs without running the downloader', async () => {
    policyMock.getConfig.mockReturnValue({ concurrencyLimit: 0 });

    /** 대기열에 남아있는 job. */
    const snapshot = service.create(baseJob);
    /** 취소된 job. */
    const canceled = service.cancel(snapshot.jobId);

    await flushAsync();

    expect(canceled.status).toBe('canceled');
    expect(mediaDownloadServiceMock.download).not.toHaveBeenCalled();
  });

  it('passes an abort signal when running jobs are canceled', async () => {
    /** 실행 중 다운로드 pending 제어 핸들. */
    const download = createDeferred<MediaDownloadArtifact>();
    mediaDownloadServiceMock.download.mockReturnValueOnce(download.promise);

    /** 실행 중 취소할 job. */
    const snapshot = service.create(baseJob);

    await flushAsync();

    /** media service에 전달된 job 입력. */
    const downloadInput = mediaDownloadServiceMock.download.mock.calls[0][0];

    service.cancel(snapshot.jobId);

    expect(downloadInput.signal.aborted).toBe(true);

    download.reject(new Error('aborted'));
    await flushAsync();
  });

  it('cleans terminal jobs after ttl', async () => {
    /** ready artifact cleanup 함수. */
    const cleanup = jest.fn();
    mediaDownloadServiceMock.download.mockResolvedValueOnce(
      createArtifact(cleanup),
    );

    /** 만료시킬 job. */
    const snapshot = service.create(baseJob);

    await flushAsync();

    expect(service.cleanupExpiredJobs(Date.now() + 1, 0)).toBe(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(() => service.get(snapshot.jobId)).toThrow(NotFoundException);
  });

  it('does not run cleanup twice when a ready artifact is consumed twice', async () => {
    /** ready artifact cleanup 함수. */
    const cleanup = jest.fn();
    mediaDownloadServiceMock.download.mockResolvedValueOnce(
      createArtifact(cleanup),
    );

    /** 다운로드할 job. */
    const snapshot = service.create(baseJob);

    await flushAsync();

    /** 첫 번째 file endpoint가 받은 artifact. */
    const artifact = service.consumeReadyArtifact(snapshot.jobId);

    artifact.cleanup();

    expect(() => service.consumeReadyArtifact(snapshot.jobId)).toThrow(
      GoneException,
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
