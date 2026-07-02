import { Outlet } from 'react-router';
import { AppHero } from './app-hero';
import { BottomTabBar } from './bottom-tab-bar';
import { NavigationLockProvider } from './navigation-lock-context';

/** 모든 web route가 공유하는 화면 레이아웃. */
export function AppLayout() {
  return (
    <NavigationLockProvider>
      <main className="app-shell">
        <section className="workspace" aria-labelledby="page-title">
          <AppHero />
          <Outlet />
        </section>
        <BottomTabBar />
      </main>
    </NavigationLockProvider>
  );
}
