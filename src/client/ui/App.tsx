import { Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { EditorPage } from './routes/EditorPage';
import { LibraryPage } from './routes/LibraryPage';
import { TrackerPage } from './routes/TrackerPage';

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<EditorPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/tracker" element={<TrackerPage />} />
        <Route path="*" element={<EditorPage />} />
      </Routes>
    </Shell>
  );
}
