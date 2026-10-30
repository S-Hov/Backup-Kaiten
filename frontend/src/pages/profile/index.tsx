import { Icon } from "@/shared/ui/icon";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, useSession } from "@/entities/session";
import { routePaths } from "@/shared/config";
import { formatDate } from "@/shared/lib/format";
import styles from "./Profile.module.scss";
import { EditAvatar } from "@/features/edit-avatar";
export function ProfilePage() {
  const user = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  function exit() {
    client.clear();
    navigate(routePaths.login, { replace: true });
  }
  const change = useMutation({
    mutationFn: () => authApi.password(current, password),
    retry: false,
    onSuccess: exit,
  });
  const logout = useMutation({
    mutationFn: () => authApi.logout(true),
    retry: false,
    onSuccess: exit,
  });
  const sessions = useQuery({
    queryKey: ["auth", "sessions"],
    queryFn: authApi.sessions,
  });
  return (
    <main className={styles.page}>
      <Link to={routePaths.board}>
        <Icon name="arrowLeft" size={16} /> На доску
      </Link>
      <h1>Профиль и безопасность</h1>
      <section className={styles.section}>
        <EditAvatar />
      </section>
      <section className={styles.section}>
        <h2>{user?.name}</h2>
        <p>{user?.email}</p>
        <p>
          {user?.role === "admin"
            ? "Администратор"
            : user?.role === "viewer"
              ? "Наблюдатель"
              : "Участник"}
          {user?.sourceId && ` · ID Kaiten: ${user.sourceId}`}
        </p>
      </section>
      <form
        className={styles.section}
        onSubmit={(e) => {
          e.preventDefault();
          if (password !== repeat) {
            setError("Пароли не совпадают");
            return;
          }
          if (!change.isPending) change.mutate();
        }}
      >
        <h2>Сменить пароль</h2>
        <p>После смены пароля потребуется войти заново на всех устройствах.</p>
        <label>
          Текущий пароль
          <input
            type="password"
            autoComplete="current-password"
            required
            value={current}
            maxLength={128}
            disabled={change.isPending}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label>
          Новый пароль
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            disabled={change.isPending}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
          />
        </label>
        <label>
          Повторите новый пароль
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            disabled={change.isPending}
            value={repeat}
            onChange={(e) => {
              setRepeat(e.target.value);
              setError("");
            }}
          />
        </label>
        {(error || change.error) && (
          <p role="alert">{error || change.error?.message}</p>
        )}
        <button disabled={change.isPending}>Сохранить новый пароль</button>
      </form>
      <section className={styles.section}>
        <h2>Активные входы</h2>
        {sessions.data?.map((row) => (
          <div className={styles.session} key={row.id}>
            <strong>
              {row.current ? "Текущий вход" : "Другое устройство"}
            </strong>
            <small>{row.userAgent}</small>
            <small>
              {formatDate(row.created)} · до {formatDate(row.expires)}
            </small>
          </div>
        ))}
        {sessions.error && <p role="alert">{sessions.error.message}</p>}
        <button disabled={logout.isPending} onClick={() => logout.mutate()}>
          Выйти на всех устройствах
        </button>
        {logout.error && <p role="alert">{logout.error.message}</p>}
      </section>
    </main>
  );
}
