import { Logger } from '@nestjs/common';
import { Response } from 'express';
import { MediaDownloadArtifact } from './media-download.types';
import { createSafeErrorLog } from './media-log-redaction';

/** HTTP 파일 전송과 artifact cleanup을 함께 처리한다. */
export function sendMediaArtifact(
  response: Response,
  artifact: MediaDownloadArtifact,
) {
  /** HTTP delivery boundary 전용 logger. */
  const logger = new Logger('HttpMediaDelivery');

  response.setHeader('Content-Type', artifact.contentType);
  response.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(artifact.downloadName)}`,
  );

  return new Promise<void>((resolve) => {
    response.sendFile(artifact.filePath, (error) => {
      artifact.cleanup();

      if (error) {
        logger.error(
          `Media delivery failed: ${artifact.kind} ${createSafeErrorLog(
            error,
          )}`,
        );

        if (!response.headersSent) {
          response.status(500).send('Failed sending media file');
        }
      }

      resolve();
    });
  });
}
