/** 사용자가 선택할 수 있는 테마 방식. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** 테마 선택을 보관하는 browser storage key. */
const THEME_PREFERENCE_KEY = 'mytube-extract-theme-preference';

/** 저장된 사용자 선택을 읽고 손상된 값은 system으로 되돌린다. */
export function getThemePreference(): ThemePreference {
  /** 저장소에서 읽은 값. */
  let storedValue: string | null;

  try {
    storedValue = window.localStorage.getItem(THEME_PREFERENCE_KEY);
  } catch {
    // 저장이 차단된 환경에서도 OS 기본 테마로 앱을 계속 렌더링한다.
    return 'system';
  }

  if (storedValue === 'light' || storedValue === 'dark' || storedValue === 'system') {
    return storedValue;
  }

  return 'system';
}

/** 선택값을 저장하고 document의 실제 표시 테마를 갱신한다. */
export function setThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_PREFERENCE_KEY, preference);
  } catch {
    // 선택값의 영속화만 건너뛰고 현재 문서에는 즉시 적용한다.
  }

  applyTheme(preference);
}

/** system 선택을 실제 light 또는 dark 값으로 해석한다. */
export function resolveTheme(preference: ThemePreference) {
  if (preference !== 'system') {
    return preference;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** CSS semantic token이 참조할 document theme를 적용한다. */
export function applyTheme(preference: ThemePreference) {
  document.documentElement.dataset.theme = resolveTheme(preference);
}
