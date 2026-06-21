const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

/** Vite production output directory. */
const outputDir = join(process.cwd(), 'dist');
/** Built HTML path. */
const indexPath = join(outputDir, 'index.html');
/** Copied web manifest path. */
const manifestPath = join(outputDir, 'manifest.webmanifest');
/** Copied service worker path. */
const serviceWorkerPath = join(outputDir, 'service-worker.js');

if (!existsSync(indexPath)) {
  throw new Error('Built index.html was not found.');
}

if (!existsSync(manifestPath)) {
  throw new Error('PWA manifest was not found.');
}

if (!existsSync(serviceWorkerPath)) {
  throw new Error('Service worker was not found.');
}

/** Built HTML content. */
const indexHtml = readFileSync(indexPath, 'utf8');
/** PWA manifest payload. */
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
/** Service worker source. */
const serviceWorker = readFileSync(serviceWorkerPath, 'utf8');

if (!indexHtml.includes('manifest.webmanifest')) {
  throw new Error('Built HTML does not reference the PWA manifest.');
}

if (manifest.display !== 'standalone') {
  throw new Error('PWA manifest must use standalone display mode.');
}

if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
  throw new Error('PWA manifest must include at least one icon.');
}

if (!serviceWorker.includes('self.addEventListener')) {
  throw new Error('Service worker does not register lifecycle handlers.');
}

console.log('Vite PWA package verified.');
