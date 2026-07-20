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

/** 헤더에서 바로 고를 수 있는 theme 방식. */
const THEME_OPTIONS = [
  { label: '시스템', value: 'system' },
  { label: '라이트', value: 'light' },
  { label: '다크', value: 'dark' },
] as const satisfies ReadonlyArray<{
  /** 화면에 표시할 theme 이름. */
  label: string;
  /** 저장할 theme preference 값. */
  value: ThemePreference;
}>;

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

  /** native radio의 theme 값을 기존 앱 state에 전달한다. */
  function handleThemeChange(event: ChangeEvent<HTMLInputElement>) {
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
      <fieldset className="theme-control">
        <legend>테마</legend>
        <div className="theme-toggle">
          {THEME_OPTIONS.map((option) => (
            <label className="theme-toggle__option" key={option.value}>
              <input
                checked={props.themePreference === option.value}
                name="theme-preference"
                type="radio"
                value={option.value}
                onChange={handleThemeChange}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="pixel-extractor" aria-hidden="true">
        <PixelExtractorArt />
      </div>
    </header>
  );
}
