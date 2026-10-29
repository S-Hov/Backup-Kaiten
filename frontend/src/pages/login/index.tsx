import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import { authApi, sessionKey } from "@/entities/session";
import { routePaths } from "@/shared/config";
import styles from "./Login.module.scss";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const login = useMutation({
    meta: { silent: true },
    mutationFn: () => authApi.login(email, password),
    retry: false,
    onSuccess: (user) => {
      client.clear();
      client.setQueryData(sessionKey, user);
      setPassword("");
      const target = params.get("returnTo") || routePaths.board;
      navigate(
        target.startsWith("/") &&
          !target.startsWith("//") &&
          !target.includes("\\")
          ? target
          : routePaths.board,
        { replace: true },
      );
    },
  });
  return (
    <main className={styles.page}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (!login.isPending) login.mutate();
        }}
      >
        <span className={styles.brand}>Гекса-А · Заказы</span>
        <h1>Вход в систему</h1>
        <p>Используйте локальную учётную запись.</p>
        <label>
          Почта
          <input
            type="email"
            autoComplete="username"
            required
            maxLength={200}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={login.isPending}
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={login.isPending}
          />
        </label>
        {login.error && (
          <p className={styles.error} role="alert">
            {login.error.message}
          </p>
        )}
        <button className={styles.primary} disabled={login.isPending}>
          {login.isPending ? "Входим…" : "Войти"}
        </button>
        <small>
          Первый вход или забытый пароль: запросите у администратора ссылку
          установки пароля. Пароль Kaiten здесь не используется.
        </small>
      </form>
    </main>
  );
}

export function ActivatePage() {
  const location = useLocation();
  const [token] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get("token") || "",
  );
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const activation = useMutation({
    meta: { silent: true },
    mutationFn: () => authApi.activate(token, password),
    retry: false,
    onSuccess: () => {
      setPassword("");
      setRepeat("");
      window.history.replaceState(null, "", routePaths.activate);
    },
  });
  return (
    <main className={styles.page}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (password !== repeat) {
            setError("Пароли не совпадают");
            return;
          }
          if (!activation.isPending) activation.mutate();
        }}
      >
        <span className={styles.brand}>Гекса-А · Заказы</span>
        <h1>
          {activation.isSuccess ? "Пароль установлен" : "Установка пароля"}
        </h1>
        {activation.isSuccess ? (
          <>
            <p>Теперь можно войти со своей почтой и новым паролем.</p>
            <Link to={routePaths.login}>Перейти ко входу</Link>
          </>
        ) : !token ? (
          <p role="alert">
            В ссылке нет кода. Откройте полную ссылку, полученную от
            администратора.
          </p>
        ) : (
          <>
            <p>Задайте пароль от 12 до 128 символов. Ссылка одноразовая.</p>
            <label>
              Новый пароль
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={password}
                disabled={activation.isPending}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
              />
            </label>
            <label>
              Повторите пароль
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={repeat}
                disabled={activation.isPending}
                onChange={(e) => {
                  setRepeat(e.target.value);
                  setError("");
                }}
              />
            </label>
            {(error || activation.error) && (
              <p className={styles.error} role="alert">
                {error || activation.error?.message}
              </p>
            )}
            <button className={styles.primary} disabled={activation.isPending}>
              {activation.isPending ? "Сохраняем…" : "Установить пароль"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
