import { Icon } from "@/shared/ui/icon";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi, useSession } from "@/entities/session";
import { Avatar } from "@/shared/ui";
import { routePaths } from "@/shared/config";
import { isTheme, setTheme, themes, type Theme } from "@/shared/lib/theme";
import styles from "./AccountMenu.module.scss";

export function AccountMenu() {
  const menuRef = useRef<HTMLDetailsElement>(null);
  function closeMenu() {
    if (menuRef.current) menuRef.current.open = false;
  }
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      )
        closeMenu();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && menuRef.current?.open) {
        closeMenu();
        menuRef.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
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
    <details className={styles.menu} ref={menuRef}>
      <summary aria-label={`Аккаунт: ${user.name}`}>
        <div>
          <strong>{user.name}</strong>
          <small>{user.email}</small>
        </div>
        <Avatar
          label={user.name}
          initials={user.initials}
          src={user.avatarUrl}
        />
      </summary>
      <div className={styles.popup}>
        <div className={styles.profile}>
          <Avatar
            label={user.name}
            initials={user.initials}
            src={user.avatarUrl}
          />
          <strong className={styles.profileName}>{user.name}</strong>
          <span className={styles.profileEmail}>{user.email}</span>
          <Link
            className={styles.profileButton}
            to={routePaths.profile}
            onClick={closeMenu}
          >
            Настройки профиля
          </Link>
        </div>
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
                      <Icon name="check" size={14} />
                    </span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {user.role === "admin" && (
          <nav className={styles.adminSection} aria-label="Администрирование">
            <span className={styles.sectionTitle}>Администрирование</span>
            <Link to={routePaths.users} onClick={closeMenu}>
              Пользователи
              <Icon name="chevron" size={16} />
            </Link>
          </nav>
        )}
        <button
          type="button"
          className={styles.logout}
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {logout.isPending ? "Выходим…" : "Выход"}
        </button>
        {logout.error && <small role="alert">{logout.error.message}</small>}
      </div>
    </details>
  );
}
