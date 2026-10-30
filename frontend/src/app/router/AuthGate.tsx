import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
import { authApi, sessionKey, SessionContext } from "@/entities/session";
import { ApiError } from "@/shared/api";
import { routePaths, pageTitles } from "@/shared/config";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  useEffect(() => {
    if (pageTitles[location.pathname])
      document.title = pageTitles[location.pathname];
  }, [location.pathname]);
  const guestPage =
    location.pathname === routePaths.login ||
    location.pathname === routePaths.activate;
  const client = useQueryClient();
  const me = useQuery({
    queryKey: sessionKey,
    queryFn: authApi.me,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
    meta: { silent: true },
  });
  useEffect(() => {
    const expired = () => {
      client.setQueryData(sessionKey, null);
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== "auth",
      });
    };
    window.addEventListener("auth-expired", expired);
    return () => window.removeEventListener("auth-expired", expired);
  }, [client]);
  if (me.isPending)
    return (
      <div className="loading-state" role="status">
        Проверяем вход…
      </div>
    );
  if (
    me.data === null ||
    (me.error instanceof ApiError && me.error.status === 401)
  )
    return guestPage ? (
      children
    ) : (
      <Navigate
        to={`${routePaths.login}?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  if (me.error || !me.data)
    return (
      <div className="loading-state" role="alert">
        <p>{me.error?.message || "Не удалось проверить вход"}</p>
        <button onClick={() => void me.refetch()}>Повторить</button>
      </div>
    );
  if (guestPage) return <Navigate to={routePaths.board} replace />;
  return (
    <SessionContext.Provider value={me.data}>
      {children}
    </SessionContext.Provider>
  );
}
