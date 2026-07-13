import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubtitleJobStatus } from '@mytube-extract/db';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { SubtitlesService } from './subtitles.service';

describe('SubtitlesService', () => {
  /** Prisma mock. */
  const prismaMock = {
    subtitleJob: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  /** R2 storage mock. */
  const r2StorageServiceMock = {
    abortMultipartUpload: jest.fn(),
    completeMultipartUpload: jest.fn(),
    createMultipartUpload: jest.fn(),
    deleteObject: jest.fn(),
    createMultipartUploadPartUrl: jest.fn(),
    getObjectMetadata: jest.fn(),
    getObjectStream: jest.fn(),
    putObject: jest.fn(),
  };
  /** config service mock. */
  const configServiceMock = {
    get: jest.fn((key: string) => {
      if (key === 'ASSET_RETENTION_DAYS') {
        return '7';
      }

      if (key === 'SUBTITLE_UPLOAD_MAX_BYTES') {
        return String(500 * 1024 * 1024);
      }

      if (key === 'SUBTITLE_UPLOAD_TOKEN_SECRET') {
        return 'test-upload-token-secret';
      }

      return undefined;
    }),
  };
  /** 테스트 대상 service. */
  let service: SubtitlesService;

  beforeEach(() => {
    jest.clearAllMocks();
    r2StorageServiceMock.abortMultipartUpload.mockResolvedValue(undefined);
    r2StorageServiceMock.completeMultipartUpload.mockResolvedValue(undefined);
    r2StorageServiceMock.createMultipartUpload.mockResolvedValue('upload-1');
    r2StorageServiceMock.createMultipartUploadPartUrl.mockImplementation(
      ({ partNumber }: { partNumber: number }) =>
        Promise.resolve(`https://r2.example/upload-part-${partNumber}`),
    );
    r2StorageServiceMock.deleteObject.mockResolvedValue(undefined);
    r2StorageServiceMock.getObjectMetadata.mockResolvedValue({
      contentLength: 5,
      contentType: 'video/mp4',
    });
    r2StorageServiceMock.putObject.mockResolvedValue(undefined);
    service = new SubtitlesService(
      prismaMock as never,
      configServiceMock as unknown as ConfigService,
      r2StorageServiceMock as never,
    );
  });

  /** 테스트용 임시 업로드 파일을 만든다. */
  async function createUploadPath(fileName = 'sample-video.mp4') {
    /** 테스트별 임시 디렉터리. */
    const directory = await mkdtemp(join(tmpdir(), 'subtitle-service-test-'));
    /** 테스트용 업로드 파일 경로. */
    const filePath = join(directory, fileName);

    await writeFile(filePath, 'video');

    return filePath;
  }

  /** 업로드 임시 파일이 삭제됐는지 확인한다. */
  async function expectUploadRemoved(filePath: string) {
    await expect(access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  }

  it('creates a queued subtitle job and uploads the source video', async () => {
    prismaMock.subtitleJob.create.mockResolvedValueOnce({
      createdAt: new Date('2026-07-03T01:00:00.000Z'),
      errorCode: null,
      expiresAt: new Date('2099-07-10T01:00:00.000Z'),
      id: 'job-1',
      originalFileName: 'sample-video.mp4',
      resultObjectKey: null,
      status: SubtitleJobStatus.queued,
      whisperModel: 'base_en',
    });

    /** 테스트용 업로드 파일 경로. */
    const filePath = await createUploadPath();

    await expect(
      service.create({
        mimetype: 'video/mp4',
        originalname: 'sample-video.mp4',
        path: filePath,
        size: 5,
      }),
    ).resolves.toMatchObject({
      displayStatus: 'queued',
      downloadUrl: null,
      fileName: 'sample-video.mp4',
      progress: 10,
      status: 'queued',
    });
    expect(r2StorageServiceMock.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          path: filePath,
        }),
        contentType: 'video/mp4',
        objectKey: expect.stringMatching(
          /^subtitles\/[0-9a-f-]+\/source\.mp4$/,
        ),
      }),
    );
    expect(prismaMock.subtitleJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          originalFileName: 'sample-video.mp4',
          sourceContentType: 'video/mp4',
          sourceSizeBytes: 5,
          whisperModel: 'base_en',
        }),
      }),
    );
  });

  it('stores the selected whisper model', async () => {
    prismaMock.subtitleJob.create.mockResolvedValueOnce({
      createdAt: new Date('2026-07-03T01:00:00.000Z'),
      errorCode: null,
      expiresAt: new Date('2099-07-10T01:00:00.000Z'),
      id: 'job-1',
      originalFileName: 'sample-video.mp4',
      resultObjectKey: null,
      status: SubtitleJobStatus.queued,
      whisperModel: 'small_en',
    });

    /** 테스트용 업로드 파일 경로. */
    const filePath = await createUploadPath();

    await expect(
      service.create(
        {
          mimetype: 'video/mp4',
          originalname: 'sample-video.mp4',
          path: filePath,
          size: 5,
        },
        'small_en',
      ),
    ).resolves.toMatchObject({
      whisperModel: 'small_en',
    });
    expect(prismaMock.subtitleJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          whisperModel: 'small_en',
        }),
      }),
    );
  });

  it('creates a direct R2 multipart upload session', async () => {
    await expect(
      service.createUpload({
        contentType: 'video/mp4',
        fileName: 'sample-video.mp4',
        sizeBytes: 128 * 1024 * 1024,
        whisperModel: 'small_en',
      }),
    ).resolves.toMatchObject({
      objectKey: expect.stringMatching(
        /^subtitles\/uploads\/[0-9a-f-]+\/source\.mp4$/,
      ),
      partSizeBytes: 64 * 1024 * 1024,
      parts: [
        { partNumber: 1, uploadUrl: 'https://r2.example/upload-part-1' },
        { partNumber: 2, uploadUrl: 'https://r2.example/upload-part-2' },
      ],
      uploadId: 'upload-1',
      uploadToken: expect.any(String),
    });
    expect(r2StorageServiceMock.createMultipartUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        contentDisposition: expect.stringContaining('sample-video.mp4'),
        contentType: 'video/mp4',
        objectKey: expect.stringMatching(
          /^subtitles\/uploads\/[0-9a-f-]+\/source\.mp4$/,
        ),
      }),
    );
  });

  it('rejects oversized direct upload metadata with 413', async () => {
    await expect(
      service.createUpload({
        contentType: 'video/mp4',
        fileName: 'sample-video.mp4',
        sizeBytes: 500 * 1024 * 1024 + 1,
        whisperModel: 'small_en',
      }),
    ).rejects.toThrow(PayloadTooLargeException);
    expect(r2StorageServiceMock.createMultipartUpload).not.toHaveBeenCalled();
  });

  it('completes a direct upload and creates a queued subtitle job', async () => {
    prismaMock.subtitleJob.create.mockResolvedValueOnce({
      createdAt: new Date('2026-07-03T01:00:00.000Z'),
      errorCode: null,
      expiresAt: new Date('2099-07-10T01:00:00.000Z'),
      id: 'job-1',
      originalFileName: 'sample-video.mp4',
      resultObjectKey: null,
      status: SubtitleJobStatus.queued,
      whisperModel: 'base_en',
    });

    /** 테스트용 direct upload session. */
    const upload = await service.createUpload({
      contentType: 'video/mp4',
      fileName: 'sample-video.mp4',
      sizeBytes: 5,
      whisperModel: 'base_en',
    });

    await expect(
      service.completeUpload({
        objectKey: upload.objectKey,
        parts: [{ etag: '"etag-1"', partNumber: 1 }],
        uploadId: upload.uploadId,
        uploadToken: upload.uploadToken,
      }),
    ).resolves.toMatchObject({
      displayStatus: 'queued',
      fileName: 'sample-video.mp4',
      jobId: 'job-1',
    });
    expect(r2StorageServiceMock.completeMultipartUpload).toHaveBeenCalledWith({
      objectKey: upload.objectKey,
      parts: [{ etag: '"etag-1"', partNumber: 1 }],
      uploadId: upload.uploadId,
    });
    expect(prismaMock.subtitleJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          originalFileName: 'sample-video.mp4',
          sourceContentType: 'video/mp4',
          sourceObjectKey: upload.objectKey,
          sourceSizeBytes: 5,
        }),
      }),
    );
  });

  it('rejects complete when uploaded object metadata differs', async () => {
    r2StorageServiceMock.getObjectMetadata.mockResolvedValueOnce({
      contentLength: 6,
      contentType: 'video/mp4',
    });

    /** 테스트용 direct upload session. */
    const upload = await service.createUpload({
      contentType: 'video/mp4',
      fileName: 'sample-video.mp4',
      sizeBytes: 5,
      whisperModel: 'base_en',
    });

    await expect(
      service.completeUpload({
        objectKey: upload.objectKey,
        parts: [{ etag: '"etag-1"', partNumber: 1 }],
        uploadId: upload.uploadId,
        uploadToken: upload.uploadToken,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.subtitleJob.create).not.toHaveBeenCalled();
    expect(r2StorageServiceMock.deleteObject).toHaveBeenCalledWith(
      upload.objectKey,
    );
  });

  it('deletes completed direct upload object when job creation fails', async () => {
    prismaMock.subtitleJob.create.mockRejectedValueOnce(new Error('db failed'));

    /** 테스트용 direct upload session. */
    const upload = await service.createUpload({
      contentType: 'video/mp4',
      fileName: 'sample-video.mp4',
      sizeBytes: 5,
      whisperModel: 'base_en',
    });

    await expect(
      service.completeUpload({
        objectKey: upload.objectKey,
        parts: [{ etag: '"etag-1"', partNumber: 1 }],
        uploadId: upload.uploadId,
        uploadToken: upload.uploadToken,
      }),
    ).rejects.toThrow('db failed');
    expect(r2StorageServiceMock.deleteObject).toHaveBeenCalledWith(
      upload.objectKey,
    );
  });

  it('aborts a direct upload with a valid token', async () => {
    /** 테스트용 direct upload session. */
    const upload = await service.createUpload({
      contentType: 'video/mp4',
      fileName: 'sample-video.mp4',
      sizeBytes: 5,
      whisperModel: 'base_en',
    });

    await service.abortUpload({
      objectKey: upload.objectKey,
      uploadId: upload.uploadId,
      uploadToken: upload.uploadToken,
    });

    expect(r2StorageServiceMock.abortMultipartUpload).toHaveBeenCalledWith({
      objectKey: upload.objectKey,
      uploadId: upload.uploadId,
    });
  });

  it('rejects complete requests without an upload token with 400', async () => {
    /** 테스트용 direct upload session. */
    const upload = await service.createUpload({
      contentType: 'video/mp4',
      fileName: 'sample-video.mp4',
      sizeBytes: 5,
      whisperModel: 'base_en',
    });

    await expect(
      service.completeUpload({
        objectKey: upload.objectKey,
        parts: [{ etag: '"etag-1"', partNumber: 1 }],
        uploadId: upload.uploadId,
        uploadToken: undefined as never,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(r2StorageServiceMock.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it('rejects abort requests without an upload token with 400', async () => {
    await expect(
      service.abortUpload({
        objectKey: 'subtitles/uploads/session-1/source.mp4',
        uploadId: 'upload-1',
        uploadToken: undefined as never,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(r2StorageServiceMock.abortMultipartUpload).not.toHaveBeenCalled();
  });

  it('rejects unsupported whisper models', async () => {
    /** 테스트용 업로드 파일 경로. */
    const filePath = await createUploadPath();

    await expect(
      service.create(
        {
          mimetype: 'video/mp4',
          originalname: 'sample-video.mp4',
          path: filePath,
          size: 5,
        },
        'large_en',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(r2StorageServiceMock.putObject).not.toHaveBeenCalled();
    await expectUploadRemoved(filePath);
  });

  it('rejects unsupported upload files', async () => {
    /** 테스트용 업로드 파일 경로. */
    const filePath = await createUploadPath('sample.txt');

    await expect(
      service.create({
        mimetype: 'text/plain',
        originalname: 'sample.txt',
        path: filePath,
        size: 4,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(r2StorageServiceMock.putObject).not.toHaveBeenCalled();
    await expectUploadRemoved(filePath);
  });

  it('rejects oversized legacy upload files with 413', async () => {
    /** 테스트용 업로드 파일 경로. */
    const filePath = await createUploadPath();

    await expect(
      service.create({
        mimetype: 'video/mp4',
        originalname: 'sample-video.mp4',
        path: filePath,
        size: 500 * 1024 * 1024 + 1,
      }),
    ).rejects.toThrow(PayloadTooLargeException);
    expect(r2StorageServiceMock.putObject).not.toHaveBeenCalled();
    await expectUploadRemoved(filePath);
  });

  it('deletes uploaded source when job creation fails', async () => {
    prismaMock.subtitleJob.create.mockRejectedValueOnce(new Error('db failed'));
    /** 테스트용 업로드 파일 경로. */
    const filePath = await createUploadPath();

    await expect(
      service.create({
        mimetype: 'video/mp4',
        originalname: 'sample-video.mp4',
        path: filePath,
        size: 5,
      }),
    ).rejects.toThrow('db failed');
    expect(r2StorageServiceMock.deleteObject).toHaveBeenCalledWith(
      expect.stringMatching(/^subtitles\/[0-9a-f-]+\/source\.mp4$/),
    );
    await expectUploadRemoved(filePath);
  });

  it('returns a completed subtitle attachment', async () => {
    /** R2 object stream mock. */
    const stream = Readable.from(['srt']);

    prismaMock.subtitleJob.findUnique.mockResolvedValueOnce({
      createdAt: new Date('2026-07-03T01:00:00.000Z'),
      errorCode: null,
      expiresAt: new Date('2099-07-10T01:00:00.000Z'),
      id: 'job-1',
      originalFileName: 'sample video.mp4',
      resultObjectKey: 'subtitles/job-1/english.srt',
      status: SubtitleJobStatus.completed,
      whisperModel: 'base_en',
    });
    r2StorageServiceMock.getObjectStream.mockResolvedValueOnce(stream);

    await expect(service.getFile('job-1')).resolves.toMatchObject({
      contentDisposition:
        'attachment; filename="sample video.en.srt"; filename*=UTF-8\'\'sample%20video.en.srt',
      contentType: 'application/x-subrip; charset=utf-8',
      stream,
    });
  });

  it('returns 404 for unknown subtitle jobs', async () => {
    prismaMock.subtitleJob.findUnique.mockResolvedValueOnce(null);

    await expect(service.get('missing')).rejects.toThrow(NotFoundException);
  });
});
