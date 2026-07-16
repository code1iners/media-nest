import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { AppHero } from './app-hero';
import { BottomTabBar } from './bottom-tab-bar';
import { NavigationLockProvider } from './navigation-lock-context';
import {
  applyTheme,
  getThemePreference,
  setThemePreference,
  type ThemePreference,
} from '../utils/theme-preference.util';

/** 모든 web route가 공유하는 화면 레이아웃. */
export function AppLayout() {
  // States.

  /** 사용자가 선택한 전체 앱 theme 방식. */
  const [themePreference, setThemePreferenceState] =
    useState<ThemePreference>(getThemePreference);

  // Effects.

  useEffect(
    function synchronizeThemePreference() {
      applyTheme(themePreference);
    },
    [themePreference],
  );

  // Handlers.

  /** theme 선택을 storage와 화면에 함께 반영한다. */
  function handleThemePreferenceChange(preference: ThemePreference) {
    setThemePreferenceState(preference);
    setThemePreference(preference);
  }

  return (
    <NavigationLockProvider>
      <main className="app-shell">
        <section className="workspace" aria-labelledby="page-title">
          <AppHero
            themePreference={themePreference}
            onThemePreferenceChange={handleThemePreferenceChange}
          />
          <Outlet />
        </section>
        <BottomTabBar />
      </main>
    </NavigationLockProvider>
  );
}
