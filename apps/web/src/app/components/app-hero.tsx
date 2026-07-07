import { useLocation } from 'react-router';
import { ROUTE_PATHS } from '../constants/route-paths.constant';
import { PixelExtractorArt } from './pixel-art';

/** 모든 route에서 공유하는 앱 상단 브랜드 영역. */
export function AppHero() {
  // Hooks.

  /** 현재 브라우저 route 위치. */
  const location = useLocation();

  // Computed.

  /** route별 hero 설명 문구. */
  const heroCopy =
    location.pathname === ROUTE_PATHS.subtitles
      ? '내 디바이스의 영상에서 영어 SRT를 생성합니다.'
      : 'YouTube URL을 제출하면 순서대로 파일을 준비합니다.';

  return (
    <header className="console-hero">
      <div className="brand-lockup">
        <p className="brand-kicker">PIXEL EXTRACTION CONSOLE</p>
        <h1 id="page-title" className="page-title">
          MyTube <span>Extract</span>
        </h1>
        <p className="hero-copy">{heroCopy}</p>
      </div>
      <div className="pixel-extractor" aria-hidden="true">
        <PixelExtractorArt />
      </div>
    </header>
  );
}
