import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi, useSession } from "@/entities/session";
import { Avatar } from "@/shared/ui";
import { routePaths } from "@/shared/config";
import { isTheme, setTheme, themes, type Theme } from "@/shared/lib/theme";
import styles from "./AccountMenu.module.scss";

export function AccountMenu() {
  const [theme, updateTheme] = useState<Theme>(() => {
    const current = document.documentElement.dataset.theme;
    return isTheme(current) ? current : "light";
  });
  function selectTheme(next: Theme) {
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
        <Avatar label={user.name} initials={user.initials} src={user.avatarUrl} />
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
        <fieldset className={styles.themePicker}>
          <legend>Оформление</legend>
          <div className={styles.themeOptions}>
            {themes.map(({ id, label }) => (
              <label className={styles.themeOption} key={id}>
                <input
                  type="radio"
                  name="account-theme"
                  value={id}
                  checked={theme === id}
                  onChange={() => selectTheme(id)}
                />
                <span className={styles.themeTile}>
                  <span
                    className={styles.themePreview}
                    data-theme-preview={id}
                    aria-hidden="true"
                  >
                    <span className={styles.previewSidebar} />
                    <span className={styles.previewCard} />
                    <span className={styles.previewCard} />
                  </span>
                  <span className={styles.themeLabel}>
                    {label}
                    <span className={styles.themeCheck} aria-hidden="true">
                      ✓
                    </span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
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
