const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

/** 기본 local MyTube Extract API base URL. */
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:5011';
/** 기본 WXT dev server port. */
const DEFAULT_WXT_DEV_PORT = '3001';
/** 기본 popup preview server port. */
const DEFAULT_PREVIEW_PORT = 3000;
/** 기본 WXT dev output root. */
const DEFAULT_DEV_OUTPUT_ROOT = '.output/chrome-mv3-dev';
/** 기본 readiness timeout. */
const DEFAULT_READY_TIMEOUT_MS = 30000;
/** 기본 readiness polling interval. */
const DEFAULT_READY_INTERVAL_MS = 500;
/** health request timeout. */
const HEALTH_REQUEST_TIMEOUT_MS = 1000;

/** 현재 프로세스가 직접 실행한 wrapper인지 확인한다. */
if (require.main === module) {
  runWxtDev();
}

/** WXT dev process를 실행하고 readiness probe를 비동기로 수행한다. */
function runWxtDev() {
  /** local API base URL. */
  const apiBaseUrl =
    process.env.WXT_MYTUBE_EXTRACT_API_BASE_URL ??
    process.env.MYTUBE_EXTRACT_API_BASE_URL ??
    process.env.WXT_MEDIA_NEST_API_BASE_URL ??
    process.env.MEDIA_NEST_API_BASE_URL ??
    DEFAULT_API_BASE_URL;
  /** WXT dev output root. */
  const outputRoot = path.resolve(
    process.env.MYTUBE_EXTRACT_WXT_DEV_OUTPUT_ROOT ??
      process.env.MEDIA_NEST_WXT_DEV_OUTPUT_ROOT ??
      DEFAULT_DEV_OUTPUT_ROOT,
  );
  /** readiness timeout. */
  const timeoutMs = Number(
    process.env.MYTUBE_EXTRACT_DEV_READY_TIMEOUT_MS ??
      process.env.MEDIA_NEST_DEV_READY_TIMEOUT_MS ??
      DEFAULT_READY_TIMEOUT_MS,
  );
  /** readiness polling interval. */
  const intervalMs = Number(
    process.env.MYTUBE_EXTRACT_DEV_READY_INTERVAL_MS ??
    process.env.MEDIA_NEST_DEV_READY_INTERVAL_MS ?? DEFAULT_READY_INTERVAL_MS,
  );
  /** WXT dev server port. */
  const devServerPort =
    process.env.MYTUBE_EXTRACT_WXT_DEV_PORT ??
    process.env.MEDIA_NEST_WXT_DEV_PORT ??
    DEFAULT_WXT_DEV_PORT;
  /** Popup preview server port. */
  const previewPort = Number(
    process.env.MYTUBE_EXTRACT_PREVIEW_PORT ??
      process.env.MEDIA_NEST_PREVIEW_PORT ??
      DEFAULT_PREVIEW_PORT,
  );
  /** WXT process argument 목록. */
  const wxtArgs = createWxtDevArgs(process.argv.slice(2), devServerPort);
  /** wrapper 시작 timestamp. */
  const startedAtMs = Date.now();
  /** WXT child process. */
  const wxtProcess = spawn(resolveWxtCommand(), wxtArgs, {
    stdio: 'inherit',
    env: createWxtDevEnv(process.env, apiBaseUrl),
  });

  waitForDevReadiness({
    apiBaseUrl,
    outputRoot,
    startedAtMs,
    timeoutMs,
    intervalMs,
  })
    .then((result) => {
      if (result.ready) {
        return startPreviewServer({ outputRoot, preferredPort: previewPort }).then(
          (previewServer) => {
            /** 자동으로 열 dev preview URL. */
            const previewUrl = createDevPreviewUrl({
              origin: previewServer.origin,
            });

            console.error(
              createDevReadySuccessMessage({
                apiBaseUrl,
                outputRoot,
                previewUrl,
              }),
            );
            openDevPreview(previewUrl);
          },
        );
      }

      console.error(createDevReadyFailureMessage({ apiBaseUrl, outputRoot, result }));
    })
    .catch((error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(
          '[mytube-extract-dev] Popup preview server port is already in use. Set MYTUBE_EXTRACT_PREVIEW_PORT to another port.',
        );
        return;
      }

      console.error(`[mytube-extract-dev] Readiness probe failed: ${error.message}`);
    });

  wxtProcess.on('error', (error) => {
    console.error(`[mytube-extract-dev] Failed to start WXT dev process: ${error.message}`);
    process.exit(1);
  });

  wxtProcess.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

/** WXT dev process에 popup runtime용 API 환경 변수를 전달한다. */
function createWxtDevEnv(env, apiBaseUrl) {
  return {
    ...env,
    WXT_MYTUBE_EXTRACT_API_BASE_URL: apiBaseUrl,
    WXT_MEDIA_NEST_API_BASE_URL: apiBaseUrl,
  };
}

/** WXT dev readiness가 충족될 때까지 기다린다. */
async function waitForDevReadiness(options) {
  /** readiness deadline timestamp. */
  const deadline = Date.now() + options.timeoutMs;
  /** 마지막 readiness probe 결과. */
  let lastResult = await probeDevReadiness(options);

  while (!lastResult.ready && Date.now() < deadline) {
    await sleep(options.intervalMs);
    lastResult = await probeDevReadiness(options);
  }

  return lastResult;
}

/** API health와 WXT dev manifest 상태를 한 번 확인한다. */
async function probeDevReadiness({
  apiBaseUrl,
  outputRoot,
  startedAtMs = 0,
  fetchImpl = fetch,
  fileExists = fs.existsSync,
  fileStats = fs.statSync,
}) {
  /** WXT dev manifest path. */
  const manifestPath = path.join(outputRoot, 'manifest.json');
  /** API health 확인 결과. */
  const apiResult = await probeApiHealth(apiBaseUrl, fetchImpl);
  /** WXT dev manifest 생성 및 갱신 여부. */
  const manifestReady =
    fileExists(manifestPath) && isFreshManifest(manifestPath, startedAtMs, fileStats);

  return {
    apiError: apiResult.error,
    apiReady: apiResult.ready,
    manifestPath,
    manifestReady,
    ready: apiResult.ready && manifestReady,
  };
}

/** wrapper 실행 이후 갱신된 manifest인지 확인한다. */
function isFreshManifest(manifestPath, startedAtMs, fileStats) {
  if (startedAtMs <= 0) {
    return true;
  }

  try {
    /** manifest file stats. */
    const stats = fileStats(manifestPath);

    return stats.mtimeMs >= startedAtMs - 1000;
  } catch {
    return false;
  }
}

/** MyTube Extract API health endpoint를 확인한다. */
async function probeApiHealth(apiBaseUrl, fetchImpl) {
  /** health request abort controller. */
  const abortController = new AbortController();
  /** health request timeout. */
  const timeout = setTimeout(() => abortController.abort(), HEALTH_REQUEST_TIMEOUT_MS);

  try {
    /** health response. */
    const response = await fetchImpl(`${apiBaseUrl}/health`, {
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    /** health response payload. */
    const payload = await response.json();

    if (payload?.ok !== true) {
      throw new Error('Expected ok=true payload');
    }

    return { ready: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      ready: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** WXT dev output을 localhost popup preview로 서빙한다. */
function startPreviewServer({ outputRoot, preferredPort = DEFAULT_PREVIEW_PORT }) {
  /** Static preview server. */
  const server = http.createServer((request, response) => {
    /** 요청 path. */
    const requestPath = request.url === '/' ? '/popup.html' : request.url ?? '/popup.html';
    /** query string이 제거된 request path. */
    const pathname = requestPath.split('?')[0];
    /** WXT output 내 실제 파일 경로. */
    const filePath = path.join(outputRoot, decodeURIComponent(pathname));

    if (!filePath.startsWith(outputRoot) || !fs.existsSync(filePath)) {
      response.statusCode = 404;
      response.end('not found');
      return;
    }

    response.setHeader('Content-Type', getContentType(filePath));
    response.end(fs.readFileSync(filePath));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(preferredPort, '127.0.0.1', () => {
      server.off('error', reject);

      /** Preview server address. */
      const address = server.address();

      if (!address || typeof address === 'string') {
        reject(new Error('Could not determine preview server address.'));
        return;
      }

      resolve({
        origin: `http://localhost:${address.port}`,
        server,
      });
    });
  });
}

/** Static file content type을 반환한다. */
function getContentType(filePath) {
  /** 정적 파일 확장자. */
  const extension = path.extname(filePath);

  if (extension === '.html') {
    return 'text/html; charset=utf-8';
  }

  if (extension === '.js') {
    return 'text/javascript; charset=utf-8';
  }

  if (extension === '.css') {
    return 'text/css; charset=utf-8';
  }

  if (extension === '.png') {
    return 'image/png';
  }

  return 'application/octet-stream';
}

/** `pnpm dev`에서 보여줄 readiness 성공 메시지를 만든다. */
function createDevReadySuccessMessage({ apiBaseUrl, outputRoot, previewUrl }) {
  return [
    '[mytube-extract-dev] MyTube Extract dev is ready.',
    `[mytube-extract-dev] API health: ${apiBaseUrl}/health`,
    `[mytube-extract-dev] WXT dev output: ${outputRoot}`,
    `[mytube-extract-dev] Opening popup preview: ${previewUrl}`,
    '[mytube-extract-dev] You can also test the real extension popup from the Chromium window opened by WXT.',
    '[mytube-extract-dev] Supported input for this MVP: https://www.youtube.com/watch?v=<11-char-id>',
  ].join('\n');
}

/** `pnpm dev`에서 보여줄 readiness 실패 메시지를 만든다. */
function createDevReadyFailureMessage({ apiBaseUrl, outputRoot, result }) {
  /** readiness failure message lines. */
  const lines = [
    '[mytube-extract-dev] Dev process is still running, but readiness was not confirmed.',
  ];

  if (!result.apiReady) {
    lines.push(
      `[mytube-extract-dev] API health check failed: ${apiBaseUrl}/health`,
      `[mytube-extract-dev] API detail: ${result.apiError?.message ?? 'unknown error'}`,
    );
  }

  if (!result.manifestReady) {
    lines.push(
      `[mytube-extract-dev] WXT dev manifest was not found: ${path.join(outputRoot, 'manifest.json')}`,
    );
  }

  lines.push('[mytube-extract-dev] Check the WXT and API logs above, then reload the extension popup.');

  return lines.join('\n');
}

/** WXT binary command를 platform별로 반환한다. */
function resolveWxtCommand() {
  return process.platform === 'win32' ? 'wxt.cmd' : 'wxt';
}

/** WXT dev server port argument를 보강한다. */
function createWxtDevArgs(args, devServerPort = DEFAULT_WXT_DEV_PORT) {
  /** 명시적인 port argument가 있는지 여부. */
  const hasPortArg = args.some((arg) => arg === '--port' || arg === '-p' || arg.startsWith('--port='));

  if (hasPortArg) {
    return args;
  }

  return [...args, '--port', devServerPort];
}

/** Dev preview URL을 만든다. */
function createDevPreviewUrl({
  origin = `http://localhost:${DEFAULT_PREVIEW_PORT}`,
}) {
  /** Dev preview URL. */
  const previewUrl = new URL('/popup.html', origin);

  return previewUrl.toString();
}

/** OS 기본 브라우저로 dev preview를 연다. */
function openDevPreview(previewUrl) {
  const shouldSkipOpen =
    process.env.MYTUBE_EXTRACT_DEV_OPEN_PREVIEW ??
    process.env.MEDIA_NEST_DEV_OPEN_PREVIEW;

  if (shouldSkipOpen === '0') {
    return;
  }

  /** Platform별 URL open command. */
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  /** Platform별 URL open argument. */
  const args = process.platform === 'win32' ? ['/c', 'start', '', previewUrl] : [previewUrl];
  /** Preview opener child process. */
  const openerProcess = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });

  openerProcess.on('error', (error) => {
    console.error(`[mytube-extract-dev] Could not open popup preview automatically: ${error.message}`);
    console.error(`[mytube-extract-dev] Open manually: ${previewUrl}`);
  });
  openerProcess.unref();
}

/** 지정된 시간만큼 대기한다. */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

module.exports = {
  createDevReadyFailureMessage,
  createDevReadySuccessMessage,
  createDevPreviewUrl,
  createWxtDevArgs,
  createWxtDevEnv,
  probeDevReadiness,
  runWxtDev,
  waitForDevReadiness,
};
