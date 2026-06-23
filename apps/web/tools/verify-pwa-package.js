const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

/** Vite production output directory. */
const outputDir = join(process.cwd(), 'dist');
/** Built HTML path. */
const indexPath = join(outputDir, 'index.html');
/** Copied web manifest path. */
const manifestPath = join(outputDir, 'manifest.webmanifest');

if (!existsSync(indexPath)) {
  throw new Error('Built index.html was not found.');
}

if (!existsSync(manifestPath)) {
  throw new Error('Web manifest was not found.');
}

/** Built HTML content. */
const indexHtml = readFileSync(indexPath, 'utf8');
/** Web manifest payload. */
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (!indexHtml.includes('manifest.webmanifest')) {
  throw new Error('Built HTML does not reference the web manifest.');
}

if (manifest.display !== 'standalone') {
  throw new Error('Web manifest must use standalone display mode.');
}

if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
  throw new Error('Web manifest must include at least one icon.');
}

console.log('Vite web package verified.');
