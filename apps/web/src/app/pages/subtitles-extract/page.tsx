import { PixelIcon } from '../../components/pixel-art';

/** 자막 추출 route placeholder page. */
export function SubtitlesExtractPage() {
  return (
    <section
      className="console-panel empty-route-panel"
      aria-labelledby="subtitles-title"
    >
      <div className="panel-title-row panel-title-row--mint">
        <h2 id="subtitles-title">
          <PixelIcon name="subtitle" />
          자막 추출
        </h2>
        <span className="title-dots" aria-hidden="true" />
      </div>
      <p>준비 중입니다.</p>
    </section>
  );
}
