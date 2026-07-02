import { PixelExtractorArt } from './pixel-art';

/** 모든 route에서 공유하는 앱 상단 브랜드 영역. */
export function AppHero() {
  return (
    <header className="console-hero">
      <div className="brand-lockup">
        <p className="brand-kicker">PIXEL EXTRACTION CONSOLE</p>
        <h1 id="page-title" className="page-title">
          MyTube <span>Extract</span>
        </h1>
        <p className="hero-copy">
          YouTube URL을 제출하면 순서대로 파일을 준비합니다.
        </p>
      </div>
      <div className="pixel-extractor" aria-hidden="true">
        <PixelExtractorArt />
      </div>
    </header>
  );
}
