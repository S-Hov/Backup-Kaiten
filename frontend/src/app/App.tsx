import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { lazy, Suspense } from "react";
import { BoardPage } from "@/pages/board";

const ArchivePage = lazy(() =>
  import("@/pages/archive").then((module) => ({ default: module.ArchivePage })),
);

function Home() {
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  // Preserve bookmarked archive links from the old homepage.
  if (query.has("snapshot") || query.has("card"))
    return <Navigate to={`/archive${location.search}`} replace />;
  return <BoardPage />;
}
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/archive"
        element={
          <Suspense
            fallback={
              <div className="loading-state" role="status">
                Открываем архив…
              </div>
            }
          >
            <ArchivePage />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
