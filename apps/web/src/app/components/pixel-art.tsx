/** 화면에서 쓰는 픽셀 아이콘 이름. */
export type PixelIconName =
  | 'audio'
  | 'completed'
  | 'download'
  | 'expired'
  | 'failed'
  | 'info'
  | 'link'
  | 'newRequest'
  | 'processing'
  | 'queued'
  | 'subtitle'
  | 'video';

/** 픽셀 아이콘 속성. */
type PixelIconProps = {
  /** 추가 className. */
  className?: string;
  /** 렌더링할 아이콘 이름. */
  name: PixelIconName;
};

/** 작은 UI용 픽셀 아이콘. */
export function PixelIcon({ className = '', name }: PixelIconProps) {
  /** SVG className. */
  const svgClassName = ['pixel-icon', className].filter(Boolean).join(' ');

  return (
    <svg
      aria-hidden="true"
      className={svgClassName}
      focusable="false"
      viewBox="0 0 32 32"
    >
      {renderPixelIcon(name)}
    </svg>
  );
}

/** Hero에 표시하는 픽셀 추출기. */
export function PixelExtractorArt() {
  return (
    <svg
      aria-hidden="true"
      className="pixel-extractor-art"
      focusable="false"
      viewBox="0 0 128 128"
    >
      <path className="pixel-extractor-art__stroke" d="M46 2h36v8H46z" />
      <path
        className="pixel-extractor-art__gold"
        d="M48 4h8v4h-8zM60 4h8v4h-8zM72 4h8v4h-8z"
      />
      <path className="pixel-extractor-art__metal" d="M61 10h8v26h-8z" />
      <path className="pixel-extractor-art__dark" d="M57 26h16v8H57z" />
      <path className="pixel-extractor-art__metal" d="M49 34h32v18H49z" />
      <path className="pixel-extractor-art__stroke" d="M53 38h24v10H53z" />
      <path className="pixel-extractor-art__gold" d="M61 40h8v6h-8z" />
      <path
        className="pixel-extractor-art__metal"
        d="M25 50h12v8H25zM91 50h12v8H91zM37 46h12v8H37zM79 46h12v8H79z"
      />
      <path
        className="pixel-extractor-art__stroke"
        d="M21 58h8v18h-8zM99 58h8v18h-8zM29 74h16v8H29zM83 74h16v8H83z"
      />
      <path className="pixel-extractor-art__base" d="M42 58h46v54H42z" />
      <path className="pixel-extractor-art__stroke" d="M36 64h58v52H36z" />
      <path className="pixel-extractor-art__screen" d="M46 72h38v30H46z" />
      <path className="pixel-extractor-art__danger" d="M52 78h24v18H52z" />
      <path
        className="pixel-extractor-art__light"
        d="M62 82h4v10h-4zM66 84h4v6h-4zM70 86h4v2h-4z"
      />
      <path className="pixel-extractor-art__dark" d="M42 108h46v8H42z" />
      <path
        className="pixel-extractor-art__mint"
        d="M34 108h10v10H34zM86 108h10v10H86z"
      />
      <path
        className="pixel-extractor-art__gold"
        d="M22 100h10v14H22zM96 100h10v14H96z"
      />
      <path
        className="pixel-extractor-art__stroke"
        d="M18 114h18v6H18zM92 114h18v6H92z"
      />
    </svg>
  );
}

/** 아이콘 이름에 맞는 픽셀 path 묶음을 반환한다. */
function renderPixelIcon(name: PixelIconName) {
  if (name === 'audio') {
    return (
      <>
        <path d="M18 5h8v4h-8zM14 9h4v14h-4zM22 9h4v4h-4z" />
        <path d="M8 20h8v6H8zM4 24h8v4H4z" />
      </>
    );
  }

  if (name === 'video') {
    return (
      <>
        <path d="M4 7h22v18H4z" />
        <path className="pixel-icon__cutout" d="M8 11h14v10H8z" />
        <path d="M10 9h4v4h-4zM18 9h4v4h-4zM10 19h4v4h-4zM18 19h4v4h-4zM26 12h4v8h-4z" />
      </>
    );
  }

  if (name === 'link') {
    return (
      <>
        <path d="M8 10h10v4H8zM4 14h4v8H4zM8 22h10v4H8zM16 18h4v4h-4z" />
        <path d="M14 6h10v4H14zM24 10h4v8h-4zM14 18h10v4H14zM12 10h4v4h-4z" />
        <path className="pixel-icon__shade" d="M10 16h12v4H10z" />
      </>
    );
  }

  if (name === 'subtitle') {
    return (
      <>
        <path d="M4 6h24v18H4z" />
        <path className="pixel-icon__cutout" d="M8 10h16v10H8z" />
        <path d="M10 13h4v3h-4zM16 13h6v3h-6zM10 18h12v3H10z" />
        <path d="M11 24h10v4H11zM14 28h4v2h-4z" />
      </>
    );
  }

  if (name === 'download') {
    return (
      <>
        <path d="M14 4h6v12h6v4h-4v4h-4v4h-2v-4h-4v-4H8v-4h6z" />
        <path d="M5 24h22v4H5zM5 20h4v4H5zM23 20h4v4h-4z" />
      </>
    );
  }

  if (name === 'newRequest') {
    return (
      <>
        <path d="M8 3h12v4h4v4h4v18H8zM20 7v4h4zM12 7h8v4h-8zM12 11h12v14H12z" />
        <path className="pixel-icon__cutout" d="M16 15h4v8h-4zM14 17h8v4h-8z" />
      </>
    );
  }

  if (name === 'info') {
    return (
      <>
        <path d="M10 4h12v4H10zM6 8h4v16H6zM22 8h4v16h-4zM10 24h12v4H10z" />
        <path d="M14 13h6v9h-6zM14 9h6v3h-6z" />
      </>
    );
  }

  if (name === 'queued') {
    return (
      <>
        <path d="M7 7h18v8H7zM4 15h24v12H4z" />
        <path className="pixel-icon__cutout" d="M9 10h14v3H9zM8 18h16v5H8z" />
        <path d="M10 20h12v3H10z" />
      </>
    );
  }

  if (name === 'processing') {
    return (
      <>
        <path d="M12 2h8v6h-8zM12 24h8v6h-8zM2 12h6v8H2zM24 12h6v8h-6zM7 7h6v6H7zM19 7h6v6h-6zM7 19h6v6H7zM19 19h6v6h-6z" />
        <path d="M10 10h12v12H10z" />
        <path className="pixel-icon__cutout" d="M14 14h4v4h-4z" />
      </>
    );
  }

  if (name === 'completed') {
    return (
      <>
        <path d="M15 3h10v4h-10zM7 7h18v4H7zM3 11h22v14H3zM7 25h18v4H7z" />
        <path className="pixel-icon__shade" d="M21 11h6v14h-6zM9 17h10v4H9z" />
        <path className="pixel-icon__cutout" d="M9 13h10v4H9z" />
      </>
    );
  }

  if (name === 'failed') {
    return (
      <>
        <path d="M8 4h16v4H8zM4 8h4v16H4zM24 8h4v16h-4zM8 24h16v4H8z" />
        <path
          className="pixel-icon__cutout"
          d="M10 10h4v4h-4zM18 10h4v4h-4zM14 14h4v4h-4zM10 18h4v4h-4zM18 18h4v4h-4z"
        />
      </>
    );
  }

  return (
    <>
      <path d="M12 2h8v4h-8zM8 6h16v4H8zM4 10h4v14H4zM24 10h4v14h-4zM8 24h16v4H8z" />
      <path className="pixel-icon__cutout" d="M12 10h4v8h-4zM16 18h6v4h-6z" />
      <path className="pixel-icon__shade" d="M22 4h4v4h-4zM6 4h4v4H6z" />
    </>
  );
}
