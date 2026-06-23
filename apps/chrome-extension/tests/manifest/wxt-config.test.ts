import { describe, expect, it } from 'vitest';
import config, { createApiHostPermission } from '../../wxt.config';

/** 테스트에서 확인할 WXT config shape. */
type TestableWxtConfig = {
  /** WXT module 목록. */
  modules?: string[];
  /** WXT manifest 설정. */
  manifest?: {
    /** Chrome permission 목록. */
    permissions?: string[];
    /** Chrome host permission 목록. */
    host_permissions?: string[];
  };
};

describe('WXT config', () => {
  it('prefers the MyTube Extract API env var for host permissions', () => {
    /** 테스트 전 API env var. */
    const previousApiBaseUrl = process.env.WXT_MYTUBE_EXTRACT_API_BASE_URL;

    process.env.WXT_MYTUBE_EXTRACT_API_BASE_URL = 'http://127.0.0.1:3030';

    try {
      expect(createApiHostPermission()).toBe('http://127.0.0.1:3030/*');
    } finally {
      if (previousApiBaseUrl === undefined) {
        delete process.env.WXT_MYTUBE_EXTRACT_API_BASE_URL;
      } else {
        process.env.WXT_MYTUBE_EXTRACT_API_BASE_URL = previousApiBaseUrl;
      }
    }
  });

  it('keeps the React module and extension permissions required by the popup flow', () => {
    /** 테스트 가능한 WXT config. */
    const testableConfig = config as TestableWxtConfig;

    expect(testableConfig.modules).toContain('@wxt-dev/module-react');
    expect(testableConfig.manifest?.permissions).toEqual(
      expect.arrayContaining(['storage', 'downloads', 'activeTab']),
    );
    expect(testableConfig.manifest?.host_permissions).toEqual([
      'https://media-nest.codeliners.cc/*',
    ]);
    expect(testableConfig.manifest?.host_permissions).not.toContain('<all_urls>');
  });

  it('builds host permissions from the configured API origin only', () => {
    expect(createApiHostPermission('http://127.0.0.1:3030')).toBe('http://127.0.0.1:3030/*');
    expect(createApiHostPermission('https://media-nest.codeliners.cc')).toBe(
      'https://media-nest.codeliners.cc/*',
    );
  });
});
