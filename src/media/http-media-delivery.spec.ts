import { Response } from 'express';
import { sendMediaArtifact } from './http-media-delivery';
import { MediaDownloadArtifact } from './media-download.types';

describe('sendMediaArtifact', () => {
  function createResponseMock(sendFileError?: Error, headersSent = false) {
    return {
      headersSent,
      sendFile: jest.fn((path: string, callback: (err?: Error) => void) => {
        callback(sendFileError);
      }),
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as unknown as Response & {
      sendFile: jest.Mock;
      setHeader: jest.Mock;
      status: jest.Mock;
      send: jest.Mock;
    };
  }

  function createArtifact(): MediaDownloadArtifact {
    return {
      cleanup: jest.fn(),
      contentType: 'video/mp4',
      downloadName: 'sample video.mp4',
      filePath: '/tmp/sample-video.mp4',
      kind: 'video',
    };
  }

  it('sets download headers, sends the file, and cleans up the artifact', async () => {
    const response = createResponseMock();
    const artifact = createArtifact();

    await sendMediaArtifact(response, artifact);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'video/mp4',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      "attachment; filename*=UTF-8''sample%20video.mp4",
    );
    expect(response.sendFile).toHaveBeenCalledWith(
      '/tmp/sample-video.mp4',
      expect.any(Function),
    );
    expect(artifact.cleanup).toHaveBeenCalledTimes(1);
  });

  it('sends a generic failure when sendFile fails before headers are sent', async () => {
    const response = createResponseMock(new Error('/tmp/private-path'));
    const artifact = createArtifact();

    await sendMediaArtifact(response, artifact);

    expect(artifact.cleanup).toHaveBeenCalledTimes(1);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.send).toHaveBeenCalledWith('Failed sending media file');
  });

  it('does not send a second response when sendFile fails after headers are sent', async () => {
    const response = createResponseMock(new Error('socket closed'), true);
    const artifact = createArtifact();

    await sendMediaArtifact(response, artifact);

    expect(artifact.cleanup).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.send).not.toHaveBeenCalled();
  });
});
