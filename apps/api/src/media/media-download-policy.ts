import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** 다운로드 실행 보호 정책. */
export type MediaDownloadPolicyConfig = {
  /** 다운로드 생성 타임아웃. 설정하지 않으면 기존 동작처럼 제한하지 않는다. */
  timeoutMs?: number;
  /** 동시 다운로드 생성 제한. 설정하지 않으면 기존 동작처럼 제한하지 않는다. */
  concurrencyLimit?: number;
  /** job API 대기열 제한. */
  queueLimit?: number;
};

/** 환경 변수 기반 다운로드 실행 보호 정책을 제공한다. */
@Injectable()
export class MediaDownloadPolicy {
  constructor(private readonly configService: ConfigService) {}

  /** 현재 다운로드 실행 보호 정책을 반환한다. */
  getConfig(): MediaDownloadPolicyConfig {
    return {
      concurrencyLimit: this.readPositiveInteger('MEDIA_DOWNLOAD_CONCURRENCY'),
      queueLimit: this.readPositiveInteger('MEDIA_DOWNLOAD_QUEUE_LIMIT'),
      timeoutMs: this.readPositiveInteger('MEDIA_DOWNLOAD_TIMEOUT_MS'),
    };
  }

  private readPositiveInteger(key: string) {
    /** 환경 변수에서 읽은 raw 정책 값. */
    const rawValue = this.configService.get<string | number | undefined>(key);

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return undefined;
    }

    /** 실행 보호 정책으로 사용할 양의 정수 값. */
    const parsedValue = Number(rawValue);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      return undefined;
    }

    return parsedValue;
  }
}
