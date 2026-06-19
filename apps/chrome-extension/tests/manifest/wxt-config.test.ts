import { describe, expect, it } from 'vitest';
import config from '../../wxt.config';

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
  it('keeps the React module and extension permissions required by the popup flow', () => {
    /** 테스트 가능한 WXT config. */
    const testableConfig = config as TestableWxtConfig;

    expect(testableConfig.modules).toContain('@wxt-dev/module-react');
    expect(testableConfig.manifest?.permissions).toEqual(
      expect.arrayContaining(['storage', 'activeTab', 'downloads']),
    );
    expect(testableConfig.manifest?.host_permissions).toContain('<all_urls>');
  });
});
