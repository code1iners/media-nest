import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ROUTE_PATHS, ROUTE_SEGMENTS } from './constants/route-paths.constant';
import { AppLayout } from './components/app-layout';
import { VideoExtractPage } from './pages/video-extract/page';
import { SubtitlesExtractPage } from './pages/subtitles-extract/page';

/** MyTube Extract web router shell. */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate replace to={ROUTE_PATHS.video} />} />
          <Route element={<VideoExtractPage />} path={ROUTE_SEGMENTS.video} />
          <Route
            element={<SubtitlesExtractPage />}
            path={ROUTE_SEGMENTS.subtitles}
          />
          <Route
            element={<Navigate replace to={ROUTE_PATHS.video} />}
            path="*"
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
