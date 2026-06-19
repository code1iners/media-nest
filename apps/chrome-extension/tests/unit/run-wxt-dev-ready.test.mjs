import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import readinessModule from '../../tools/run-wxt-dev-ready.js';

const {
  createDevReadyFailureMessage,
  createDevReadySuccessMessage,
  createDevPreviewUrl,
  createWxtDevArgs,
  probeDevReadiness,
} = readinessModule;

describe('WXT dev readiness', () => {
  it('reports ready when the local API and WXT dev manifest are available', async () => {
    /** 테스트용 WXT dev output root. */
    const outputRoot = path.join(os.tmpdir(), 'media-nest-dev-ready');
    /** Readiness probe 결과. */
    const result = await probeDevReadiness({
      apiBaseUrl: 'http://127.0.0.1:3030',
      outputRoot,
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { ok: true };
        },
      }),
      fileExists: (filePath) => filePath === path.join(outputRoot, 'manifest.json'),
    });

    expect(result).toMatchObject({
      apiReady: true,
      manifestReady: true,
      ready: true,
    });
  });

  it('keeps API and manifest failures distinguishable', async () => {
    /** 테스트용 WXT dev output root. */
    const outputRoot = path.join(os.tmpdir(), 'media-nest-dev-missing');
    /** Readiness probe 결과. */
    const result = await probeDevReadiness({
      apiBaseUrl: 'http://127.0.0.1:3030',
      outputRoot,
      fetchImpl: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:3030');
      },
      fileExists: () => false,
    });

    expect(result).toMatchObject({
      apiReady: false,
      manifestReady: false,
      ready: false,
    });
    expect(result.apiError?.message).toContain('ECONNREFUSED');
  });

  it('does not treat a stale WXT manifest as dev-ready', async () => {
    /** 테스트용 WXT dev output root. */
    const outputRoot = path.join(os.tmpdir(), 'media-nest-dev-stale');
    /** stale manifest path. */
    const manifestPath = path.join(outputRoot, 'manifest.json');
    /** Readiness probe 결과. */
    const result = await probeDevReadiness({
      apiBaseUrl: 'http://127.0.0.1:3030',
      outputRoot,
      startedAtMs: 2000,
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { ok: true };
        },
      }),
      fileExists: (filePath) => filePath === manifestPath,
      fileStats: () => ({
        mtimeMs: 500,
      }),
    });

    expect(result).toMatchObject({
      apiReady: true,
      manifestReady: false,
      ready: false,
    });
  });

  it('keeps probing when manifest stats cannot be read yet', async () => {
    /** 테스트용 WXT dev output root. */
    const outputRoot = path.join(os.tmpdir(), 'media-nest-dev-stat-race');
    /** Readiness probe 결과. */
    const result = await probeDevReadiness({
      apiBaseUrl: 'http://127.0.0.1:3030',
      outputRoot,
      startedAtMs: 2000,
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { ok: true };
        },
      }),
      fileExists: () => true,
      fileStats: () => {
        throw new Error('ENOENT');
      },
    });

    expect(result).toMatchObject({
      apiReady: true,
      manifestReady: false,
      ready: false,
    });
  });

  it('prints actionable success and failure messages for pnpm dev', () => {
    /** 테스트용 WXT dev output root. */
    const outputRoot = path.join(os.tmpdir(), 'media-nest-dev-message');

    expect(
      createDevReadySuccessMessage({
        apiBaseUrl: 'http://127.0.0.1:3030',
        outputRoot,
        previewUrl: 'http://localhost:3000/popup.html',
      }),
    ).toContain('Media Nest dev is ready');

    expect(
      createDevReadyFailureMessage({
        apiBaseUrl: 'http://127.0.0.1:3030',
        outputRoot,
        result: {
          apiReady: false,
          manifestReady: false,
          ready: false,
          apiError: new Error('Server is unavailable.'),
        },
      }),
    ).toContain('API health check failed');
  });

  it('adds the default WXT dev server port and builds the popup preview URL', () => {
    expect(createWxtDevArgs([], '3001')).toEqual(['--port', '3001']);
    expect(createWxtDevArgs(['--port', '3009'], '3001')).toEqual(['--port', '3009']);
    expect(
      createDevPreviewUrl({
        apiBaseUrl: 'http://127.0.0.1:3030',
        origin: 'http://localhost:3000',
      }),
    ).toBe(
      'http://localhost:3000/popup.html?apiBaseUrl=http%3A%2F%2F127.0.0.1%3A3030&tabUrl=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123_DEF0',
    );
  });
});
