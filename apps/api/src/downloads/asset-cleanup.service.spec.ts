import { AssetCleanupService } from './asset-cleanup.service';

describe('AssetCleanupService', () => {
  /** Prisma mock. */
  const prismaMock = {
    extractedAsset: {
      delete: jest.fn(),
      findMany: jest.fn(),
    },
  };
  /** R2 storage mock. */
  const r2StorageMock = {
    deleteObject: jest.fn(),
  };
  /** 테스트 대상 service. */
  let service: AssetCleanupService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AssetCleanupService(
      prismaMock as never,
      r2StorageMock as never,
    );
  });

  it('deletes expired R2 objects and asset rows', async () => {
    prismaMock.extractedAsset.findMany.mockResolvedValueOnce([
      {
        id: 'asset-1',
        objectKey: 'extracts/dQw4w9WgXcQ/audio-192.mp3',
      },
    ]);

    await expect(service.cleanupExpiredAssets()).resolves.toBe(1);
    expect(r2StorageMock.deleteObject).toHaveBeenCalledWith(
      'extracts/dQw4w9WgXcQ/audio-192.mp3',
    );
    expect(prismaMock.extractedAsset.delete).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
    });
  });

  it('keeps the asset row when R2 deletion fails', async () => {
    prismaMock.extractedAsset.findMany.mockResolvedValueOnce([
      {
        id: 'asset-1',
        objectKey: 'extracts/dQw4w9WgXcQ/audio-192.mp3',
      },
    ]);
    r2StorageMock.deleteObject.mockRejectedValueOnce(new Error('r2 failed'));

    await expect(service.cleanupExpiredAssets()).resolves.toBe(1);
    expect(prismaMock.extractedAsset.delete).not.toHaveBeenCalled();
  });
});
