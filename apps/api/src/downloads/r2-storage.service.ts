import { Readable } from 'node:stream';
import { ReadableStream } from 'node:stream/web';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** R2 삭제에 필요한 환경 설정. */
type R2Config = {
  /** R2 S3 compatible endpoint. */
  endpoint: string;
  /** R2 bucket 이름. */
  bucket: string;
  /** R2 access key. */
  accessKeyId: string;
  /** R2 secret key. */
  secretAccessKey: string;
  /** R2 public base URL. */
  publicBaseUrl?: string;
};

/** Cloudflare R2 object 삭제 adapter. */
@Injectable()
export class R2StorageService {
  /** S3 compatible client. */
  private client?: S3Client;

  constructor(private readonly configService: ConfigService) {}

  /** R2 object를 삭제한다. */
  async deleteObject(objectKey: string) {
    /** R2 설정. */
    const config = this.getConfig();

    await this.getClient(config).send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
      }),
    );
  }

  /** R2 object를 업로드한다. */
  async putObject(input: {
    /** 업로드할 byte 본문. */
    body: Buffer | Readable;
    /** 브라우저 다운로드 동작을 제어할 disposition. */
    contentDisposition?: string;
    /** 업로드할 object MIME type. */
    contentType: string;
    /** R2 object key. */
    objectKey: string;
  }) {
    /** R2 설정. */
    const config = this.getConfig();

    await this.getClient(config).send(
      new PutObjectCommand({
        Body: input.body,
        Bucket: config.bucket,
        ContentDisposition: input.contentDisposition,
        ContentType: input.contentType,
        Key: input.objectKey,
      }),
    );
  }

  /** R2 multipart upload를 시작한다. */
  async createMultipartUpload(input: {
    /** 브라우저 다운로드 동작을 제어할 disposition. */
    contentDisposition?: string;
    /** 업로드할 object MIME type. */
    contentType: string;
    /** R2 object key. */
    objectKey: string;
  }) {
    /** R2 설정. */
    const config = this.getConfig();
    /** multipart upload 시작 결과. */
    const output = await this.getClient(config).send(
      new CreateMultipartUploadCommand({
        Bucket: config.bucket,
        ContentDisposition: input.contentDisposition,
        ContentType: input.contentType,
        Key: input.objectKey,
      }),
    );

    if (!output.UploadId) {
      throw new InternalServerErrorException('R2 upload ID is missing');
    }

    return output.UploadId;
  }

  /** R2 multipart part 업로드용 presigned URL을 만든다. */
  async createMultipartUploadPartUrl(input: {
    /** presigned URL 유효 시간. */
    expiresInSeconds: number;
    /** R2 object key. */
    objectKey: string;
    /** R2 multipart part 번호. */
    partNumber: number;
    /** R2 multipart upload ID. */
    uploadId: string;
  }) {
    /** R2 설정. */
    const config = this.getConfig();

    return getSignedUrl(
      this.getClient(config),
      new UploadPartCommand({
        Bucket: config.bucket,
        Key: input.objectKey,
        PartNumber: input.partNumber,
        UploadId: input.uploadId,
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  /** R2 multipart upload를 완료한다. */
  async completeMultipartUpload(input: {
    /** R2 object key. */
    objectKey: string;
    /** 업로드된 part 목록. */
    parts: Array<{
      /** R2 multipart part ETag. */
      etag: string;
      /** R2 multipart part 번호. */
      partNumber: number;
    }>;
    /** R2 multipart upload ID. */
    uploadId: string;
  }) {
    /** R2 설정. */
    const config = this.getConfig();

    await this.getClient(config).send(
      new CompleteMultipartUploadCommand({
        Bucket: config.bucket,
        Key: input.objectKey,
        MultipartUpload: {
          Parts: input.parts.map((part) => ({
            ETag: part.etag,
            PartNumber: part.partNumber,
          })),
        },
        UploadId: input.uploadId,
      }),
    );
  }

  /** R2 multipart upload를 취소한다. */
  async abortMultipartUpload(input: {
    /** R2 object key. */
    objectKey: string;
    /** R2 multipart upload ID. */
    uploadId: string;
  }) {
    /** R2 설정. */
    const config = this.getConfig();

    await this.getClient(config).send(
      new AbortMultipartUploadCommand({
        Bucket: config.bucket,
        Key: input.objectKey,
        UploadId: input.uploadId,
      }),
    );
  }

  /** R2 object metadata를 읽는다. */
  async getObjectMetadata(objectKey: string) {
    /** R2 설정. */
    const config = this.getConfig();
    /** R2 object metadata. */
    const output = await this.getClient(config).send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
      }),
    );

    return {
      contentLength: output.ContentLength ?? null,
      contentType: output.ContentType ?? null,
    };
  }

  /** R2 object를 HTTP 응답으로 pipe할 수 있는 stream으로 읽는다. */
  async getObjectStream(objectKey: string) {
    /** R2 설정. */
    const config = this.getConfig();
    try {
      /** R2 object 조회 결과. */
      const output = await this.getClient(config).send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: objectKey,
        }),
      );

      if (!output.Body) {
        throw new InternalServerErrorException('R2 object body is empty');
      }

      if (output.Body instanceof Readable) {
        return output.Body;
      }

      /** 브라우저/Node fetch body 형태를 안전하게 Buffer stream으로 변환한다. */
      const transformableBody = output.Body as {
        transformToByteArray?: () => Promise<Uint8Array>;
      };

      if (typeof transformableBody.transformToByteArray === 'function') {
        return Readable.from(
          Buffer.from(await transformableBody.transformToByteArray()),
        );
      }

      throw new InternalServerErrorException(
        'R2 object body is not streamable',
      );
    } catch (error) {
      if (!isNoSuchKeyError(error)) {
        throw error;
      }

      return this.getPublicObjectStream(config, objectKey);
    }
  }

  /** DB asset row가 가리키는 실제 R2 object가 존재하는지 확인한다. */
  async objectExists(objectKey: string) {
    /** R2 설정. */
    const config = this.getConfig();

    try {
      await this.getClient(config).send(
        new HeadObjectCommand({
          Bucket: config.bucket,
          Key: objectKey,
        }),
      );

      return true;
    } catch (error) {
      if (!isMissingObjectError(error)) {
        throw error;
      }
    }

    return this.publicObjectExists(config, objectKey);
  }

  /** 환경 변수에서 R2 설정을 읽는다. */
  private getConfig(): R2Config {
    /** R2 endpoint. */
    const endpoint = this.configService.get<string>('R2_ENDPOINT');
    /** R2 bucket. */
    const bucket = this.configService.get<string>('R2_BUCKET');
    /** R2 access key. */
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    /** R2 secret key. */
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );
    /** R2 public base URL. */
    const publicBaseUrl = this.configService.get<string>('R2_PUBLIC_BASE_URL');

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException('R2 configuration is missing');
    }

    return { accessKeyId, bucket, endpoint, publicBaseUrl, secretAccessKey };
  }

  /** 설정이 같다는 전제로 client를 lazy 생성한다. */
  private getClient(config: R2Config) {
    if (!this.client) {
      this.client = new S3Client({
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        endpoint: config.endpoint,
        region: 'auto',
      });
    }

    return this.client;
  }

  /** S3 read가 key mismatch로 실패할 때 public CDN에서 object를 읽는다. */
  private async getPublicObjectStream(config: R2Config, objectKey: string) {
    if (!config.publicBaseUrl) {
      throw new InternalServerErrorException('R2 public base URL is missing');
    }

    /** public CDN object 응답. */
    const response = await fetch(
      `${config.publicBaseUrl.replace(/\/$/, '')}/${objectKey.replace(/^\//, '')}`,
    );

    if (!response.ok || !response.body) {
      throw new InternalServerErrorException(
        'R2 public object is not readable',
      );
    }

    return Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
  }

  /** public CDN 기준 object 존재 여부를 확인한다. */
  private async publicObjectExists(config: R2Config, objectKey: string) {
    if (!config.publicBaseUrl) {
      return false;
    }

    /** public CDN object HEAD 응답. */
    const response = await fetch(
      `${config.publicBaseUrl.replace(/\/$/, '')}/${objectKey.replace(/^\//, '')}`,
      { method: 'HEAD' },
    );

    return response.ok;
  }
}

/** R2 S3 API가 object key를 못 찾은 경우인지 확인한다. */
function isMissingObjectError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (('Code' in error &&
      (error.Code === 'NoSuchKey' || error.Code === 'NotFound')) ||
      ('$metadata' in error &&
        (error.$metadata as { httpStatusCode?: number }).httpStatusCode ===
          404))
  );
}

const isNoSuchKeyError = isMissingObjectError;
