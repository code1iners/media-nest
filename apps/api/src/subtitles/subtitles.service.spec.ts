import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubtitleJobStatus } from '@mytube-extract/db';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
    deleteObject: jest.fn(),
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

      return undefined;
    }),
  };
  /** 테스트 대상 service. */
  let service: SubtitlesService;

  beforeEach(() => {
    jest.clearAllMocks();
    r2StorageServiceMock.deleteObject.mockResolvedValue(undefined);
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
      expiresAt: new Date('2026-07-10T01:00:00.000Z'),
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
      expiresAt: new Date('2026-07-10T01:00:00.000Z'),
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
      expiresAt: new Date('2026-07-10T01:00:00.000Z'),
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
