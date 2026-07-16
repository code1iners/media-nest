/** Popup에서 선택할 수 있는 theme 방식. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** Popup의 theme 선택을 보관하는 storage key. */
const THEME_PREFERENCE_KEY = 'mytube-extract-popup-theme-preference';

/** 저장된 theme 선택을 읽고 유효하지 않으면 system으로 처리한다. */
export function getThemePreference(): ThemePreference {
  /** 저장된 theme 값. */
  let storedValue: string | null;

  try {
    storedValue = window.localStorage.getItem(THEME_PREFERENCE_KEY);
  } catch {
    // 저장이 차단된 popup도 OS 기본 테마로 계속 렌더링한다.
    return 'system';
  }

  if (storedValue === 'light' || storedValue === 'dark' || storedValue === 'system') {
    return storedValue;
  }

  return 'system';
}

/** theme 선택을 저장하고 CSS token용 실제 theme를 적용한다. */
export function setThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_PREFERENCE_KEY, preference);
  } catch {
    // 선택값의 영속화만 건너뛰고 현재 popup에는 즉시 적용한다.
  }

  applyTheme(preference);
}

/** system 선택을 브라우저가 적용할 theme로 해석한다. */
export function applyTheme(preference: ThemePreference) {
  document.documentElement.dataset.theme =
    preference === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference;
}
