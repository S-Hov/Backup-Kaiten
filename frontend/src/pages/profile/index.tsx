import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, useSession } from "@/entities/session";
import { EditAvatar } from "@/features/edit-avatar";
import { routePaths, type BoardView } from "@/shared/config";
import { formatDate } from "@/shared/lib/format";
import { readBoardView, storeBoardView } from "@/shared/lib/board-view";
import { useStoredFlag } from "@/shared/lib/use-stored-flag";
import { Avatar } from "@/shared/ui";
import { Icon } from "@/shared/ui/icon";
import { ThemePicker } from "@/shared/ui/theme-picker";
import styles from "./Profile.module.scss";

const sections = [
  {
    id: "profile",
    label: "Профиль",
    description: "Личные данные и аватар",
    icon: "users",
  },
  {
    id: "appearance",
    label: "Внешний вид",
    description: "Тема и оформление",
    icon: "theme",
  },
  {
    id: "display",
    label: "Отображение",
    description: "Доска и карточки",
    icon: "board",
  },
  {
    id: "security",
    label: "Безопасность",
    description: "Пароль и активные входы",
    icon: "lock",
  },
] as const;

export function ProfilePage() {
  const user = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const active =
    sections.find((section) => section.id === params.get("section")) ||
    sections[0];
  const [view, setView] = useState<BoardView>(readBoardView);
  const [fullscreen, toggleFullscreen] = useStoredFlag("card-modal.fullscreen");
  const [panelHidden, togglePanel] = useStoredFlag("card-modal.panel-hidden");
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
    enabled: active.id === "security",
  });
  const role =
    user?.role === "admin"
      ? "Администратор"
      : user?.role === "viewer"
        ? "Наблюдатель"
        : "Участник";

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.back} to={routePaths.board}>
          <Icon name="arrowLeft" size={18} /> На доску
        </Link>
        <span>Настройки аккаунта</span>
        {user && (
          <Avatar
            label={user.name}
            initials={user.initials}
            src={user.avatarUrl}
          />
        )}
      </header>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.identity}>
            {user && (
              <Avatar
                label={user.name}
                initials={user.initials}
                src={user.avatarUrl}
              />
            )}
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
          <nav aria-label="Разделы настроек" className={styles.navigation}>
            {sections.map((section) => (
              <Link
                key={section.id}
                to={{
                  pathname: routePaths.profile,
                  search: `?section=${section.id}`,
                }}
                aria-current={section.id === active.id ? "page" : undefined}
              >
                <Icon name={section.icon} size={20} />
                <span>
                  <strong>{section.label}</strong>
                  <small>{section.description}</small>
                </span>
                <Icon name="chevron" size={15} />
              </Link>
            ))}
          </nav>
        </aside>
        <main className={styles.content}>
          <header className={styles.heading}>
            <span className={styles.eyebrow}>НАСТРОЙКИ ПРОФИЛЯ</span>
            <h1>{active.label}</h1>
            <p>
              {active.id === "profile"
                ? "Информация о вас и то, как вас видят коллеги."
                : active.id === "appearance"
                  ? "Выберите оформление, с которым приятно работать."
                  : active.id === "display"
                    ? "Настройте доску и открытие карточек под свои привычки."
                    : "Управляйте паролем и доступом к своему аккаунту."}
            </p>
          </header>

          {active.id === "profile" && (
            <>
              <section
                className={styles.section}
                aria-labelledby="personal-title"
              >
                <div className={styles.sectionHeading}>
                  <h2 id="personal-title">Личные данные</h2>
                  <span className={styles.badge}>{role}</span>
                </div>
                <dl className={styles.details}>
                  <div>
                    <dt>Полное имя</dt>
                    <dd>{user?.name || "—"}</dd>
                  </div>
                  <div>
                    <dt>Электронная почта</dt>
                    <dd>{user?.email || "—"}</dd>
                  </div>
                  <div>
                    <dt>Инициалы</dt>
                    <dd>{user?.initials || "—"}</dd>
                  </div>
                  {user?.sourceId && (
                    <div>
                      <dt>ID в Kaiten</dt>
                      <dd>{user.sourceId}</dd>
                    </div>
                  )}
                </dl>
              </section>
              <section
                className={styles.section}
                aria-label="Изображение профиля"
              >
                <EditAvatar />
              </section>
            </>
          )}

          {active.id === "appearance" && (
            <>
              <section className={styles.section}>
                <h2>Цветовая тема</h2>
                <p>Применяется сразу ко всему интерфейсу.</p>
                <ThemePicker />
              </section>
              <p className={styles.note}>
                <Icon name="check" size={16} /> Тема сохраняется в этом
                браузере. Быстро сменить её можно и в меню профиля.
              </p>
            </>
          )}

          {active.id === "display" && (
            <>
              <section className={styles.section}>
                <h2>Рабочая доска</h2>
                <p>В каком виде открывать доску по умолчанию.</p>
                <fieldset className={styles.viewPicker}>
                  <legend>Вид доски</legend>
                  {(
                    [
                      {
                        id: "board",
                        label: "Канбан",
                        description: "Карточки по колонкам",
                        icon: "board",
                      },
                      {
                        id: "lists",
                        label: "Списки",
                        description: "Компактное представление",
                        icon: "lists",
                      },
                    ] as const
                  ).map((option) => (
                    <label key={option.id} className={styles.viewOption}>
                      <input
                        type="radio"
                        name="board-view"
                        value={option.id}
                        checked={view === option.id}
                        onChange={() => {
                          setView(option.id);
                          storeBoardView(option.id);
                        }}
                      />
                      <span>
                        <Icon name={option.icon} size={26} />
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                        <Icon name="check" size={18} />
                      </span>
                    </label>
                  ))}
                </fieldset>
                <p className={styles.hint}>
                  На самой доске вид по-прежнему можно переключать. Ссылки с
                  указанным видом откроются в нём.
                </p>
              </section>
              <section className={styles.section}>
                <h2>Открытие карточек</h2>
                <p>Эти параметры также можно менять прямо в карточке.</p>
                <label className={styles.toggleRow}>
                  <span>
                    <strong>На весь экран</strong>
                    <small>Открывать карточки во всё окно браузера</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={fullscreen}
                    onChange={toggleFullscreen}
                  />
                  <i aria-hidden="true" />
                </label>
                <label className={styles.toggleRow}>
                  <span>
                    <strong>Панель комментариев</strong>
                    <small>
                      Показывать обсуждение рядом с содержимым карточки
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={!panelHidden}
                    onChange={togglePanel}
                  />
                  <i aria-hidden="true" />
                </label>
              </section>
              <p className={styles.note}>
                <Icon name="check" size={16} /> Изменения сохраняются
                автоматически в этом браузере.
              </p>
            </>
          )}

          {active.id === "security" && (
            <>
              <form
                className={styles.section}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (password !== repeat) {
                    setError("Пароли не совпадают");
                    return;
                  }
                  if (!change.isPending) change.mutate();
                }}
              >
                <h2>Сменить пароль</h2>
                <p>
                  После смены пароля потребуется войти заново на всех
                  устройствах.
                </p>
                <div className={styles.passwordFields}>
                  <label>
                    Текущий пароль
                    <input
                      type="password"
                      autoComplete="current-password"
                      required
                      value={current}
                      maxLength={128}
                      disabled={change.isPending}
                      onChange={(event) => setCurrent(event.target.value)}
                    />
                  </label>
                  <label>
                    <span id="new-password-label">Новый пароль</span>
                    <input
                      type="password"
                      aria-labelledby="new-password-label"
                      aria-describedby="new-password-hint"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      required
                      disabled={change.isPending}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setError("");
                      }}
                    />
                    <small id="new-password-hint">Не менее 12 символов</small>
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
                      onChange={(event) => {
                        setRepeat(event.target.value);
                        setError("");
                      }}
                    />
                  </label>
                </div>
                {(error || change.error) && (
                  <p role="alert">{error || change.error?.message}</p>
                )}
                <button
                  className={styles.primaryButton}
                  disabled={change.isPending}
                >
                  {change.isPending ? "Сохраняем…" : "Сохранить новый пароль"}
                </button>
              </form>
              <section className={styles.section}>
                <h2>Активные входы</h2>
                <p>Устройства, на которых выполнен вход в ваш аккаунт.</p>
                {sessions.isPending && (
                  <p role="status">Загружаем активные входы…</p>
                )}
                {sessions.data?.length === 0 && <p>Активных входов нет.</p>}
                {sessions.data?.map((row) => (
                  <div className={styles.session} key={row.id}>
                    <span className={styles.sessionIcon}>
                      <Icon name="device" size={22} />
                    </span>
                    <div>
                      <strong>
                        {row.current ? "Текущий вход" : "Другое устройство"}
                      </strong>
                      <small>
                        {row.userAgent || "Устройство не определено"}
                      </small>
                      <small>
                        Вход: {formatDate(row.created)} · до{" "}
                        {formatDate(row.expires)}
                      </small>
                    </div>
                    {row.current && (
                      <span className={styles.badge}>Это устройство</span>
                    )}
                  </div>
                ))}
                {sessions.error && (
                  <p role="alert">
                    {sessions.error.message}{" "}
                    <button
                      type="button"
                      onClick={() => void sessions.refetch()}
                    >
                      Повторить
                    </button>
                  </p>
                )}
                <div className={styles.sessionFooter}>
                  <button
                    className={styles.dangerButton}
                    type="button"
                    disabled={logout.isPending}
                    onClick={() => logout.mutate()}
                  >
                    {logout.isPending
                      ? "Завершаем входы…"
                      : "Выйти на всех устройствах"}
                  </button>
                  <small>Включая это устройство</small>
                </div>
                {logout.error && <p role="alert">{logout.error.message}</p>}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
