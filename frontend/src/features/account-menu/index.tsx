import { Icon } from "@/shared/ui/icon";
import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi, useSession } from "@/entities/session";
import { Avatar } from "@/shared/ui";
import { routePaths } from "@/shared/config";
import { ThemePicker } from "@/shared/ui/theme-picker";
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
        <ThemePicker compact />
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
