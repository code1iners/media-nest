import { type ChangeEvent } from 'react';
import { useLocation } from 'react-router';
import { ROUTE_PATHS } from '../constants/route-paths.constant';
import { type ThemePreference } from '../utils/theme-preference.util';
import { PixelExtractorArt } from './pixel-art';

/** AppHero 입력값. */
type AppHeroProps = {
  /** 현재 theme 선택. */
  themePreference: ThemePreference;
  /** theme 변경 콜백. */
  onThemePreferenceChange: (preference: ThemePreference) => void;
};

/** 모든 route에서 공유하는 앱 상단 브랜드 영역. */
export function AppHero(props: AppHeroProps) {
  // Hooks.

  /** 현재 브라우저 route 위치. */
  const location = useLocation();

  // Computed.

  /** route별 짧은 현재 작업 라벨. */
  const pageLabel =
    location.pathname === ROUTE_PATHS.subtitles
      ? '영어 SRT 생성'
      : '영상 추출';

  // Handlers.

  /** native select의 theme 값을 앱 state에 전달한다. */
  function handleThemeChange(event: ChangeEvent<HTMLSelectElement>) {
    props.onThemePreferenceChange(event.currentTarget.value as ThemePreference);
  }

  return (
    <header className="console-hero">
      <div className="brand-lockup">
        <h1 id="page-title" className="page-title">
          MyTube <span>Extract</span>
        </h1>
        <p className="hero-copy">{pageLabel}</p>
      </div>
      <label className="theme-control">
        <span>테마</span>
        <select value={props.themePreference} onChange={handleThemeChange}>
          <option value="system">시스템</option>
          <option value="light">라이트</option>
          <option value="dark">다크</option>
        </select>
      </label>
      <div className="pixel-extractor" aria-hidden="true">
        <PixelExtractorArt />
      </div>
    </header>
  );
}
