import { BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** URL query에서 들어오는 숫자형 입력값. */
export type NumericQueryValue = number | string;

/** YouTube 영상 ID 형식. */
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** 경로 탐색을 막기 위해 파일명에서 차단할 문자. */
const BLOCKED_FILENAME_PATTERN = /[\/\\\0\r\n]/;

/** 요청 단위 임시 작업 디렉터리를 생성한다. */
export function createMediaWorkDir() {
  return mkdtempSync(join(tmpdir(), 'media-nest-'));
}

/** 요청 단위 임시 작업 디렉터리만 정리한다. */
export function cleanupMediaWorkDir(workDir: string) {
  rmSync(workDir, { force: true, recursive: true });
}

/** 다운로드 파일명을 응답 헤더와 저장 경로에 쓰기 전에 검증한다. */
export function normalizeDownloadName(filename: string) {
  const normalizedFilename = filename.trim();

  if (
    !normalizedFilename ||
    normalizedFilename === '.' ||
    normalizedFilename === '..' ||
    BLOCKED_FILENAME_PATTERN.test(normalizedFilename)
  ) {
    throw new BadRequestException(
      'filename must not include path separators or control characters',
    );
  }

  return normalizedFilename;
}

/** URL query의 숫자 옵션을 양의 정수로 변환한다. */
export function parsePositiveInteger(
  value: NumericQueryValue | undefined,
  fieldName: string,
) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new BadRequestException(`${fieldName} must be a positive integer`);
  }

  return parsedValue;
}

/** 외부 입력 URL을 http/https URL로 제한한다. */
export function normalizeSourceUrl(url: string | undefined) {
  if (!url) {
    throw new BadRequestException('url is required');
  }

  try {
    const parsedUrl = new URL(url);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Unsupported protocol');
    }

    return parsedUrl.toString();
  } catch {
    throw new BadRequestException('url must be a valid URL');
  }
}

/** YouTube 영상 ID를 watch URL로 변환한다. */
export function createYoutubeWatchUrl(videoId: string) {
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    throw new BadRequestException('id must be a valid YouTube video id');
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** 비동기 다운로드 실패를 이미 응답한 요청과 충돌하지 않게 보낸다. */
export function sendDownloadFailure(response: Response, message: string) {
  if (!response.headersSent) {
    response.status(500).send(message);
  }
}
