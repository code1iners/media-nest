import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

/** Browser smoke 실행 mode. */
const smokeMode =
  process.env.MYTUBE_EXTRACT_POPUP_SMOKE_MODE ??
  process.env.MEDIA_NEST_POPUP_SMOKE_MODE ??
  'production';
/** Dev smoke 여부. */
const isDevSmoke = smokeMode === 'dev';
/** Browser smoke mode별 기본 WXT output root. */
const defaultExtensionOutputRoot = isDevSmoke ? '.output/chrome-mv3-dev' : '.output/chrome-mv3';
/** WXT output root. */
const extensionOutputRoot = path.resolve(
  process.env.MYTUBE_EXTRACT_EXTENSION_OUTPUT_ROOT ??
    process.env.MEDIA_NEST_EXTENSION_OUTPUT_ROOT ??
    defaultExtensionOutputRoot,
);
/** 실제 MyTube Extract API base URL. */
const realApiBaseUrl =
  process.env.WXT_MYTUBE_EXTRACT_API_BASE_URL ??
  process.env.MYTUBE_EXTRACT_API_BASE_URL ??
  process.env.WXT_MEDIA_NEST_API_BASE_URL ??
  process.env.MEDIA_NEST_API_BASE_URL ??
  'https://media-nest.codeliners.cc';
/** Built popup에 주입되는 MyTube Extract API origin. */
const expectedApiOrigin = new URL(realApiBaseUrl).origin;

if (!['production', 'dev'].includes(smokeMode)) {
  throw new Error(`Unsupported popup smoke mode: ${smokeMode}`);
}

if (!fs.existsSync(path.join(extensionOutputRoot, 'manifest.json'))) {
  throw new Error(createMissingOutputMessage(smokeMode, extensionOutputRoot));
}

await assertRealApiHealth(realApiBaseUrl);
console.error('[popup-smoke] real API health ok');

if (isDevSmoke) {
  await verifyLoadUnpackedPopup(extensionOutputRoot);
  console.error('[popup-smoke] dev load unpacked popup ok');
  console.log(
    JSON.stringify(
      {
        mode: smokeMode,
        outputRoot: extensionOutputRoot,
        realApiHealth: `${realApiBaseUrl}/health`,
        status: 'ok',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

/** Browser smoke용 static output server. */
const staticServer = await createStaticServer(extensionOutputRoot);

  try {
    await verifyLoadUnpackedPopup(extensionOutputRoot);
    console.error('[popup-smoke] load unpacked popup ok');
    await verifyMissingSourceUrlFlow(staticServer.origin);
    console.error('[popup-smoke] missing source URL flow ok');
    await verifyCurrentTabImportFlow(staticServer.origin);
    console.error('[popup-smoke] current tab import flow ok');
    /** 서버 실패 flow에서 수집한 fake API 요청. */
    const unavailableFakeApiRequests = await verifyServerUnavailableFlow(staticServer.origin);
  console.error('[popup-smoke] server unavailable flow ok');
  /** 다운로드 flow에서 수집한 fake API 요청. */
  const fakeApiRequests = await verifyDownloadFlow(staticServer.origin);
  console.error('[popup-smoke] download flow ok');

  console.log(
    JSON.stringify(
      {
        realApiHealth: `${realApiBaseUrl}/health`,
        mode: smokeMode,
        outputRoot: extensionOutputRoot,
        fakeApiRequests,
        unavailableFakeApiRequests,
        status: 'ok',
      },
      null,
      2,
    ),
  );
} finally {
  await staticServer.close();
}

/** 실제 MyTube Extract API health endpoint를 확인한다. */
async function assertRealApiHealth(apiBaseUrl) {
  /** health check abort controller. */
  const abortController = new AbortController();
  /** health check timeout. */
  const timeout = setTimeout(() => abortController.abort(), 5000);

  try {
    /** 실제 API health 응답. */
    const response = await fetch(`${apiBaseUrl}/health`, {
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`MyTube Extract API health responded with ${response.status}`);
    }

    /** 실제 API health payload. */
    const payload = await response.json();

    if (payload?.ok !== true) {
      throw new Error('MyTube Extract API health payload did not contain ok=true');
    }
  } finally {
    clearTimeout(timeout);
  }
}

/** WXT build output을 load unpacked로 올린 실제 extension popup 렌더링을 확인한다. */
async function verifyLoadUnpackedPopup(outputRoot) {
  /** Chromium user data dir. */
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytube-extract-extension-'));

  await launchAndCloseExtensionContext(userDataDir, outputRoot);

  /** load unpacked extension ID. */
  const extensionId = await readLoadedExtensionId(userDataDir, outputRoot);
  /** Chromium persistent context. */
  const context = await launchExtensionContext(userDataDir, outputRoot);

  try {
    /** 실제 extension popup page. */
    const popupPage = await context.newPage();

    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, {
      timeout: 10000,
      waitUntil: 'domcontentloaded',
    });
    await popupPage.getByRole('heading', { name: 'MyTube Extract' }).waitFor({ timeout: 10000 });
    await popupPage.getByText('이 영상은 이제 제 겁니다').waitFor({ timeout: 10000 });
  } finally {
    await closeBrowserContext(context);
  }
}

/** Extension context를 열었다가 닫아 Chrome profile에 extension settings를 flush한다. */
async function launchAndCloseExtensionContext(userDataDir, outputRoot) {
  /** Chromium persistent context. */
  const context = await launchExtensionContext(userDataDir, outputRoot);

  await new Promise((resolve) => setTimeout(resolve, 1000));
  await closeBrowserContext(context);
}

/** Extension이 load unpacked된 Chromium context를 연다. */
function launchExtensionContext(userDataDir, outputRoot) {
  return chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${outputRoot}`,
      `--load-extension=${outputRoot}`,
    ],
    ignoreDefaultArgs: ['--disable-extensions'],
  });
}

/** Built popup에서 source URL 미입력 상태를 확인한다. */
async function verifyMissingSourceUrlFlow(origin) {
  /** Browser instance. */
  const browser = await chromium.launch();
  /** Browser page. */
  const page = await browser.newPage();

  try {
    await installFakeChromeApi(page, {
      storedOptions: {},
    });
    await page.goto(`${origin}/popup.html`, { timeout: 10000, waitUntil: 'domcontentloaded' });

    await expectStatusText(page, '추출할 URL을 입력하세요.');
    await expectDownloadButtonDisabled(page, true);
  } finally {
    await browser.close();
  }
}

/** Built popup에서 현재 탭 URL 가져오기 흐름을 확인한다. */
async function verifyCurrentTabImportFlow(origin) {
  /** Browser instance. */
  const browser = await chromium.launch();
  /** Browser page. */
  const page = await browser.newPage();

  try {
    await installFakeChromeApi(page, {
      currentTabUrl: 'https://youtu.be/abc123_DEF0',
      storedOptions: {},
    });
    await page.goto(`${origin}/popup.html`, { timeout: 10000, waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: '현재 탭 사용' }).click();
    await expectStatusText(page, '추출할 URL이 준비되었습니다.');
    await expectDownloadButtonDisabled(page, false);

    /** 현재 탭에서 가져온 source URL 입력값. */
    const sourceUrl = await page.getByLabel('추출 URL').inputValue();

    if (sourceUrl !== 'https://www.youtube.com/watch?v=abc123_DEF0') {
      throw new Error(`Unexpected imported source URL: ${sourceUrl}`);
    }
  } finally {
    await browser.close();
  }
}

/** Built popup에서 API health 실패 상태를 확인한다. */
async function verifyServerUnavailableFlow(origin) {
  /** Browser instance. */
  const browser = await chromium.launch();
  /** Browser page. */
  const page = await browser.newPage();
  /** Fake API 요청 목록. */
  const requests = [];

  try {
    await routeMyTubeExtractApi(page, {
      requests,
      healthOk: false,
    });
    await installFakeChromeApi(page, {
      storedOptions: {
        mode: 'audio',
      },
    });
    await page.goto(`${origin}/popup.html`, { timeout: 10000, waitUntil: 'domcontentloaded' });

    await page.getByLabel('추출 URL').fill('https://www.youtube.com/watch?v=abc123_DEF0');
    await expectStatusText(page, '추출할 URL이 준비되었습니다.');
    await page.getByRole('button', { name: '추출 시작' }).click();
    await expectStatusText(page, 'Server is unavailable.');

    /** Fake Chrome downloads API가 요청한 URL. */
    const downloadUrl = await page.evaluate(() => globalThis.__myTubeExtractDownloadUrl);

    if (downloadUrl !== null) {
      throw new Error(`Expected no download URL, got ${downloadUrl}`);
    }

    return requests;
  } finally {
    await browser.close();
  }
}

/** Built popup에서 supported page 다운로드 시작 흐름을 확인한다. */
async function verifyDownloadFlow(origin) {
  /** Browser instance. */
  const browser = await chromium.launch();
  /** Browser page. */
  const page = await browser.newPage({ viewport: { width: 360, height: 600 } });
  /** Fake API 요청 목록. */
  const requests = [];

  try {
    await routeMyTubeExtractApi(page, {
      requests,
      healthOk: true,
    });
    await installFakeChromeApi(page, {
      storedOptions: {
        mode: 'audio',
      },
    });
    await page.goto(`${origin}/popup.html`, { timeout: 10000, waitUntil: 'domcontentloaded' });

    await page.getByLabel('추출 URL').fill('https://www.youtube.com/watch?v=abc123_DEF0');
    await page.getByLabel('파일명').fill('browser smoke');
    await page.getByLabel('최대 비트레이트').fill('192');
    await expectStatusText(page, '추출할 URL이 준비되었습니다.');
    await expectDownloadButtonDisabled(page, false);
    await expectDownloadButtonVisibleInViewport(page);
    await page.getByRole('button', { name: '추출 시작' }).click();
    await expectStatusText(page, '추출 요청을 시작했습니다.');

    /** Fake Chrome downloads API가 요청한 URL. */
    const downloadUrl = await page.evaluate(() => globalThis.__myTubeExtractDownloadUrl);

    if (
      downloadUrl !==
      `${expectedApiOrigin}/audio?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123_DEF0&filename=browser+smoke&bitrate=192`
    ) {
      throw new Error(`Unexpected download URL: ${downloadUrl}`);
    }

    return requests;
  } finally {
    await browser.close();
  }
}

/** Production API 요청을 browser smoke 안에서 fake 응답으로 처리한다. */
async function routeMyTubeExtractApi(page, { requests, healthOk }) {
  await page.route(`${expectedApiOrigin}/**`, async (route) => {
    /** 가로챈 production API 요청 URL. */
    const requestUrl = new URL(route.request().url());

    requests.push(`${requestUrl.pathname}${requestUrl.search}`);

    if (requestUrl.pathname === '/health') {
      await route.fulfill({
        status: healthOk ? 200 : 503,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ok: healthOk }),
      });
      return;
    }

    if (requestUrl.pathname === '/audio' && requestUrl.searchParams.has('url')) {
      await route.fulfill({
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Disposition': 'attachment; filename="browser-smoke.mp3"',
          'Content-Type': 'audio/mpeg',
        },
        body: 'browser smoke audio',
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: 'not found',
    });
  });
}

/** Page에 extension popup용 fake Chrome API를 주입한다. */
async function installFakeChromeApi(page, options) {
  await page.addInitScript((chromeOptions) => {
    globalThis.__myTubeExtractStoredOptions = chromeOptions.storedOptions;
    globalThis.__myTubeExtractDownloadUrl = null;
    globalThis.__myTubeExtractCurrentTabUrl =
      chromeOptions.currentTabUrl ?? 'https://www.youtube.com/watch?v=abc123_DEF0';
    globalThis.chrome = {
      runtime: {
        lastError: null,
      },
      storage: {
        local: {
          get(_keys, callback) {
            callback(globalThis.__myTubeExtractStoredOptions);
          },
          set(items, callback) {
            globalThis.__myTubeExtractStoredOptions = items;
            callback();
          },
        },
      },
      downloads: {
        async download(downloadOptions, callback) {
          globalThis.__myTubeExtractDownloadUrl = downloadOptions.url;
          await fetch(downloadOptions.url);
          callback(1);
        },
      },
      tabs: {
        query(_queryInfo, callback) {
          callback([
            {
              active: true,
              id: 1,
              url: globalThis.__myTubeExtractCurrentTabUrl,
            },
          ]);
        },
      },
    };
  }, options);
}

/** load unpacked extension ID를 Chrome profile에서 읽는다. */
async function readLoadedExtensionId(userDataDir, outputRoot) {
  /** Secure Preferences 경로. */
  const securePreferencesPath = path.join(userDataDir, 'Default', 'Secure Preferences');

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (fs.existsSync(securePreferencesPath)) {
      /** Chrome secure preferences. */
      const preferences = JSON.parse(fs.readFileSync(securePreferencesPath, 'utf8'));
      /** Extension settings. */
      const settings = preferences.extensions?.settings ?? {};
      /** MyTube Extract extension entry. */
      const extensionEntry = Object.entries(settings).find(
        ([, value]) => value.path === outputRoot,
      );

      if (extensionEntry) {
        return extensionEntry[0];
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Could not find loaded extension ID.');
}

/** smoke mode에 맞는 output 누락 메시지를 만든다. */
function createMissingOutputMessage(mode, outputRoot) {
  if (mode === 'dev') {
    return `WXT dev output is missing at ${outputRoot}. Run \`pnpm dev\` first and wait for the readiness message.`;
  }

  return `WXT build output is missing at ${outputRoot}. Run \`pnpm --filter chrome-extension run build\` first.`;
}

/** Browser context를 timeout과 함께 닫는다. */
async function closeBrowserContext(context) {
  await Promise.race([
    context.close(),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timed out while closing browser context.')), 10000);
    }),
  ]);
}

/** Status text가 기대값이 될 때까지 기다린다. */
async function expectStatusText(page, expectedText) {
  await page.getByRole('status').filter({ hasText: expectedText }).waitFor({ timeout: 10000 });
}

/** Download button disabled 상태를 확인한다. */
async function expectDownloadButtonDisabled(page, expectedDisabled) {
  /** Download button disabled 여부. */
  const disabled = await page
    .getByRole('button', { name: '추출 시작' })
    .evaluate((button) => button.disabled);

  if (disabled !== expectedDisabled) {
    throw new Error(`Expected download button disabled=${expectedDisabled}, got ${disabled}`);
  }
}

/** 360x600 popup viewport에서 주요 다운로드 버튼이 바로 보이는지 확인한다. */
async function expectDownloadButtonVisibleInViewport(page) {
  /** Download button 위치와 viewport 크기. */
  const metrics = await page.getByRole('button', { name: '추출 시작' }).evaluate((button) => {
    /** Download button viewport 기준 rect. */
    const rect = button.getBoundingClientRect();

    return {
      bottom: rect.bottom,
      innerHeight: window.innerHeight,
      top: rect.top,
    };
  });

  if (metrics.top < 0 || metrics.bottom > metrics.innerHeight - 12) {
    throw new Error(
      `Expected download button within 360x600 popup viewport, got top=${metrics.top}, bottom=${metrics.bottom}, innerHeight=${metrics.innerHeight}`,
    );
  }
}

/** WXT output static server를 만든다. */
function createStaticServer(rootDirectory) {
  /** Static server. */
  const server = http.createServer((request, response) => {
    /** 요청 path. */
    const requestPath = request.url === '/' ? '/popup.html' : request.url ?? '/popup.html';
    /** 정적 파일 경로. */
    const filePath = path.join(rootDirectory, decodeURIComponent(requestPath.split('?')[0]));

    if (!filePath.startsWith(rootDirectory) || !fs.existsSync(filePath)) {
      response.statusCode = 404;
      response.end('not found');
      return;
    }

    response.setHeader('Content-Type', getContentType(filePath));
    response.end(fs.readFileSync(filePath));
  });

  return listen(server);
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

/** HTTP server를 임의 port로 연다. */
function listen(server, extra = {}) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      /** Server address. */
      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Could not determine server address.');
      }

      resolve({
        ...extra,
        origin: `http://127.0.0.1:${address.port}`,
        close() {
          return new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          });
        },
      });
    });
  });
}
