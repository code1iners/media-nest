const fs = require('fs');
const path = require('path');

/** 확장 프로그램 package root. */
const packageRoot = process.cwd();
/** WXT production output 경로. */
const outputRoot = path.join(packageRoot, '.output/chrome-mv3');
/** generated manifest 파일 경로. */
const manifestPath = path.join(outputRoot, 'manifest.json');
/** 누락된 정적 파일 참조 목록. */
const missingReferences = [];
/** 검증 실패 목록. */
const validationErrors = [];

/** 존재해야 하는 파일 참조를 확인한다. */
function assertOutputFileExists(referencePath, ownerPath) {
  /** WXT output root 기준 실제 파일 경로. */
  const absolutePath = path.join(outputRoot, referencePath.replace(/^\//, ''));

  if (!fs.existsSync(absolutePath)) {
    missingReferences.push(`${ownerPath} -> ${referencePath}`);
  }
}

/** manifest field가 기대값을 포함하는지 확인한다. */
function assertIncludes(values, expectedValue, ownerPath) {
  if (!values?.includes(expectedValue)) {
    validationErrors.push(`${ownerPath} should include ${expectedValue}`);
  }
}

/** generated manifest에 선언된 정적 파일 참조를 확인한다. */
function verifyManifestReferences(manifest) {
  if (manifest.action?.default_popup) {
    assertOutputFileExists(manifest.action.default_popup, 'manifest.json');
  } else {
    validationErrors.push('manifest.json should define action.default_popup');
  }

  Object.values(manifest.icons ?? {}).forEach((iconPath) => {
    assertOutputFileExists(iconPath, 'manifest.json');
  });

  assertIncludes(manifest.permissions, 'storage', 'manifest.json permissions');
  assertIncludes(manifest.permissions, 'activeTab', 'manifest.json permissions');
  assertIncludes(manifest.permissions, 'downloads', 'manifest.json permissions');
  assertIncludes(manifest.host_permissions, '<all_urls>', 'manifest.json host_permissions');
}

/** generated popup HTML에 선언된 CSS와 script 참조를 확인한다. */
function verifyPopupReferences(popupPath) {
  /** popup HTML 절대 경로. */
  const popupAbsolutePath = path.join(outputRoot, popupPath);
  /** popup HTML 내용. */
  const popupHtml = fs.readFileSync(popupAbsolutePath, 'utf8');
  /** popup HTML이 위치한 디렉터리. */
  const popupDirectory = path.dirname(popupPath);
  /** 정적 asset 참조를 찾기 위한 정규식. */
  const assetReferencePattern =
    /<(?:link|script)\b[^>]*(?:href|src)="([^"]+)"[^>]*>/g;

  for (const match of popupHtml.matchAll(assetReferencePattern)) {
    /** HTML 파일 위치 기준 상대 참조. */
    const assetReference = match[1];

    if (/^(https?:)?\/\//.test(assetReference)) {
      continue;
    }

    assertOutputFileExists(
      path.normalize(path.join(popupDirectory, assetReference)),
      popupPath,
    );
  }
}

if (!fs.existsSync(manifestPath)) {
  console.error('WXT build output was not found. Run wxt build before verification.');
  process.exit(1);
}

/** generated manifest 내용. */
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

verifyManifestReferences(manifest);

if (manifest.action?.default_popup) {
  verifyPopupReferences(manifest.action.default_popup);
}

if (missingReferences.length > 0 || validationErrors.length > 0) {
  if (missingReferences.length > 0) {
    console.error('Missing extension file references:');
  }

  missingReferences.forEach((reference) => {
    console.error(`- ${reference}`);
  });

  if (validationErrors.length > 0) {
    console.error('Invalid extension manifest values:');
  }

  validationErrors.forEach((validationError) => {
    console.error(`- ${validationError}`);
  });

  process.exit(1);
}
