import { lazy, Suspense } from "react";
import { Navigate, useLocation, useRoutes } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { BoardPage } from "@/pages/board";
import { routePaths, routeParams, routeUrls } from "@/shared/config";

const ArchivePage = lazy(() =>
  import("@/pages/archive").then((module) => ({ default: module.ArchivePage })),
);
function BoardEntry() {
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  if (
    query.has(routeParams.legacySnapshot) ||
    query.has(routeParams.legacyCard)
  )
    return <Navigate to={routeUrls.archive(location.search)} replace />;
  return <BoardPage />;
}
export const pageRoutes: RouteObject[] = [
  { path: routePaths.board, element: <BoardEntry /> },
  { path: routePaths.archive, element: <ArchivePage /> },
  { path: "*", element: <Navigate to={routePaths.board} replace /> },
];
export function AppRouter() {
  const page = useRoutes(pageRoutes);
  return (
    <Suspense
      fallback={
        <div className="loading-state" role="status">
          Открываем страницу…
        </div>
      }
    >
      {page}
    </Suspense>
  );
}
