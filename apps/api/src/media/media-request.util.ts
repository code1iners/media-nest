import { BadRequestException } from '@nestjs/common';
import { generate } from '@ce1pers/random-helpers';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  AudioIdRequestInput,
  AudioMediaRequest,
  AudioUrlRequestInput,
  VideoIdRequestInput,
  VideoMediaRequest,
  VideoUrlRequestInput,
} from './media-request.model';
import {
  createUrlMediaSource,
  createYoutubeIdMediaSource,
} from './media-source-policy';

/** URL query에서 들어오는 숫자형 입력값. */
export type NumericQueryValue = number | string;

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
  return createUrlMediaSource(url).url;
}

/** YouTube 영상 ID를 watch URL로 변환한다. */
export function createYoutubeWatchUrl(videoId: string) {
  return createYoutubeIdMediaSource(videoId).url;
}

/** 파일명 입력이 없을 때 기존 계약인 15자 랜덤 파일명을 만든다. */
function normalizeRequestFilename(filename: string | undefined) {
  return normalizeDownloadName(filename || generate({ length: 15 }));
}

/** URL 기반 오디오 요청을 검증된 request object로 변환한다. */
export function parseAudioUrlRequest(
  input: AudioUrlRequestInput,
): AudioMediaRequest {
  return {
    bitrate: parsePositiveInteger(input.bitrate, 'bitrate'),
    filename: normalizeRequestFilename(input.filename),
    source: createUrlMediaSource(input.url),
  };
}

/** YouTube ID 기반 오디오 요청을 검증된 request object로 변환한다. */
export function parseAudioIdRequest(
  videoId: string,
  input: AudioIdRequestInput,
): AudioMediaRequest {
  return {
    bitrate: parsePositiveInteger(input.bitrate, 'bitrate'),
    filename: normalizeRequestFilename(input.filename),
    source: createYoutubeIdMediaSource(videoId),
  };
}

/** URL 기반 비디오 요청을 검증된 request object로 변환한다. */
export function parseVideoUrlRequest(
  input: VideoUrlRequestInput,
): VideoMediaRequest {
  return {
    filename: normalizeRequestFilename(input.filename),
    resolution: parsePositiveInteger(input.resolution, 'resolution'),
    source: createUrlMediaSource(input.url),
  };
}

/** YouTube ID 기반 비디오 요청을 검증된 request object로 변환한다. */
export function parseVideoIdRequest(
  videoId: string,
  input: VideoIdRequestInput,
): VideoMediaRequest {
  return {
    filename: normalizeRequestFilename(input.filename),
    resolution: parsePositiveInteger(input.resolution, 'resolution'),
    source: createYoutubeIdMediaSource(videoId),
  };
}
