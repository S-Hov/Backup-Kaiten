import { lazy, Suspense } from "react";
import { Navigate, useLocation, useRoutes } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { BoardPage } from "@/pages/board";
import { routePaths, routeParams, routeUrls } from "@/shared/config";

const LoginPage = lazy(() =>
  import("@/pages/login").then((module) => ({ default: module.LoginPage })),
);
const ActivatePage = lazy(() =>
  import("@/pages/login").then((module) => ({ default: module.ActivatePage })),
);
const UsersPage = lazy(() =>
  import("@/pages/users").then((module) => ({ default: module.UsersPage })),
);
const ProfilePage = lazy(() =>
  import("@/pages/profile").then((module) => ({ default: module.ProfilePage })),
);
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
  { path: routePaths.login, element: <LoginPage /> },
  { path: routePaths.activate, element: <ActivatePage /> },
  { path: routePaths.users, element: <UsersPage /> },
  { path: routePaths.profile, element: <ProfilePage /> },
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
