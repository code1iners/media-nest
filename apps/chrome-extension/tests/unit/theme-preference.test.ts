import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getThemePreference,
  setThemePreference,
} from '../../src/shared/theme-preference';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('popup theme preference', () => {
  it('keeps rendering when browser storage is unavailable', () => {
    /** localStorage 접근 시 policy 오류를 내는 storage. */
    const unavailableStorage = {
      getItem() {
        throw new DOMException('Storage is disabled.', 'SecurityError');
      },
      setItem() {
        throw new DOMException('Storage is disabled.', 'SecurityError');
      },
    };
    /** 테스트용 document theme target. */
    const documentElement = { dataset: {} as Record<string, string> };

    vi.stubGlobal('window', {
      localStorage: unavailableStorage,
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal('document', { documentElement });

    expect(getThemePreference()).toBe('system');
    expect(() => setThemePreference('dark')).not.toThrow();
    expect(documentElement.dataset.theme).toBe('dark');
  });
});
