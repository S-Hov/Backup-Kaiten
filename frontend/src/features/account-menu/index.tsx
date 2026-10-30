import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi, useSession } from "@/entities/session";
import { routePaths } from "@/shared/config";
import { setTheme, type Theme } from "@/shared/lib/theme";
import styles from "./AccountMenu.module.scss";

export function AccountMenu() {
  const [theme, updateTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    updateTheme(next);
  }
  const user = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: () => authApi.logout(),
    retry: false,
    onSuccess: () => {
      client.clear();
      navigate(routePaths.login, { replace: true });
    },
  });
  if (!user)
    return (
      <div aria-label="Аккаунт: Локальный пользователь (макет)">
        Локальный пользователь
      </div>
    );
  return (
    <details className={styles.menu}>
      <summary aria-label={`Аккаунт: ${user.name}`}>
        <div>
          <strong>{user.name}</strong>
          <small>{user.email}</small>
        </div>
        <span>
          {user.initials ||
            user.name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase()}
        </span>
      </summary>
      <div className={styles.popup}>
        <small>
          {user.role === "admin"
            ? "Администратор"
            : user.role === "viewer"
              ? "Наблюдатель"
              : "Участник"}
        </small>
        <Link to={routePaths.profile}>Профиль и безопасность</Link>
        {user.role === "admin" && (
          <Link to={routePaths.users}>Пользователи</Link>
        )}
        <button type="button" onClick={toggleTheme}>
          {theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
        </button>
        <button
          type="button"
          className={styles.logout}
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          Выйти
        </button>
        {logout.error && <small role="alert">{logout.error.message}</small>}
      </div>
    </details>
  );
}
