import { Avatar } from "@/shared/ui";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/entities/session";
import { userApi } from "@/entities/user";
import type { DirectoryUser, AccountRole } from "@/entities/user";
import { routePaths } from "@/shared/config";
import { notify } from "@/shared/ui/notifications";
import styles from "./Users.module.scss";

const statuses = {
  active: "Доступ открыт",
  disabled: "Доступ отключён",
  pending: "Ожидает установки пароля",
  "no-access": "Нет учётной записи",
};
function UserRow({
  user,
  onInvite,
}: {
  user: DirectoryUser;
  onInvite: (email: string, role: AccountRole) => void;
}) {
  const [role, setRole] = useState<AccountRole>(user.role || "member");
  const client = useQueryClient();
  const update = useMutation({
    mutationFn: ({
      active,
      revoke = false,
    }: {
      active: boolean;
      revoke?: boolean;
    }) => userApi.access(user.accountId!, active, role, revoke),
    retry: false,
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  return (
    <tr>
      <td>
        <strong>
          <Avatar
            label={user.name || "Участник"}
            initials={user.initials}
            src={user.avatarUrl}
          />{" "}
          {user.name || "Без имени"}
        </strong>
        <small>{user.email || "Почта не сохранена"}</small>
      </td>
      <td>
        <span className={styles.status} data-status={user.status}>
          {statuses[user.status]}
        </span>
        <small>{!user.sourceActive && "Неактивен в исходной копии"}</small>
      </td>
      <td>{user.sourceId || "Локальный"}</td>
      <td>
        <select
          aria-label={`Роль: ${user.name}`}
          value={role}
          disabled={update.isPending}
          onChange={(e) => setRole(e.target.value as AccountRole)}
        >
          <option value="member">Участник</option>
          <option value="viewer">Наблюдатель</option>
          <option value="admin">Администратор</option>
        </select>
        {user.accountId && role !== user.role && (
          <button
            onClick={() => update.mutate({ active: user.status === "active" })}
            disabled={update.isPending}
          >
            Сохранить роль
          </button>
        )}
      </td>
      <td>
        <div className={styles.actions}>
          <button
            disabled={
              !user.email ||
              update.isPending ||
              (!!user.accountId && role !== user.role)
            }
            onClick={() => onInvite(user.email!, role)}
          >
            {user.accountId ? "Ссылка установки пароля" : "Выдать доступ"}
          </button>
          {(user.status === "active" || user.status === "pending") && (
            <button
              disabled={update.isPending}
              onClick={() => update.mutate({ active: false, revoke: true })}
            >
              Отключить
            </button>
          )}
          {user.status === "disabled" && user.hasPassword && (
            <button
              disabled={update.isPending}
              onClick={() => update.mutate({ active: true })}
            >
              Включить
            </button>
          )}
        </div>
        {update.error && <small role="alert">{update.error.message}</small>}
      </td>
    </tr>
  );
}
export function UsersPage() {
  const me = useSession();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [link, setLink] = useState("");
  const [email, setEmail] = useState("");
  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: userApi.list,
    enabled: me?.role === "admin",
  });
  const invite = useMutation({
    mutationFn: ({ email, role }: { email: string; role: AccountRole }) =>
      userApi.invite(email, role),
    retry: false,
    onSuccess: (result) => {
      setLink(
        `${window.location.origin}${routePaths.activate}#token=${result.token}`,
      );
      void client.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
  if (me?.role !== "admin")
    return (
      <main className={styles.page}>
        <Link to={routePaths.board}>← На доску</Link>
        <h1>Нужны права администратора</h1>
      </main>
    );
  const term = search.toLocaleLowerCase();
  const rows = (users.data || []).filter((user) =>
    `${user.name} ${user.email || ""} ${user.sourceId || ""}`
      .toLocaleLowerCase()
      .includes(term),
  );
  return (
    <main className={styles.page}>
      <Link to={routePaths.board}>← На доску</Link>
      <h1>
        Пользователи <small>{users.data?.length || 0}</small>
      </h1>
      <p>
        Профиль из Kaiten и доступ в локальную систему — разные записи. Доступ
        открывается только после приглашения и установки пароля.
      </p>
      <div className={styles.tools}>
        <input
          type="search"
          aria-label="Поиск пользователей"
          placeholder="Имя, почта или номер Kaiten"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate({ email, role: "member" });
          }}
        >
          <input
            type="email"
            required
            maxLength={200}
            aria-label="Почта нового пользователя"
            placeholder="Новая почта"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button disabled={invite.isPending}>Пригласить</button>
        </form>
      </div>
      {link && (
        <section className={styles.invitation} aria-label="Приглашение">
          <strong>Одноразовая ссылка · действует 24 часа</strong>
          <p>
            Передайте её только выбранному пользователю. Новая ссылка отменяет
            предыдущую.
          </p>
          <input aria-label="Ссылка установки пароля" readOnly value={link} />
          <button
            onClick={() =>
              void navigator.clipboard.writeText(link).then(
                () => notify.success("Ссылка скопирована"),
                () => notify.error("Не удалось скопировать ссылку"),
              )
            }
          >
            Скопировать
          </button>
          <button onClick={() => setLink("")}>Скрыть ссылку</button>
        </section>
      )}
      {invite.error && <p role="alert">{invite.error.message}</p>}
      {users.isPending ? (
        <p role="status">Загружаем пользователей…</p>
      ) : users.error ? (
        <p role="alert">{users.error.message}</p>
      ) : (
        <div className={styles.table}>
          <table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Доступ</th>
                <th>ID Kaiten</th>
                <th>Роль</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <UserRow
                  key={`${user.userId}:${user.role}:${user.status}`}
                  user={user}
                  onInvite={(email, role) => invite.mutate({ email, role })}
                />
              ))}
            </tbody>
          </table>
          {!rows.length && <p>Пользователи не найдены</p>}
        </div>
      )}
    </main>
  );
}
