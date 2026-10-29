import { useEffect, useState } from "react";
import { Icon } from "@/shared/ui/icon";
import styles from "./BoardControls.module.scss";

export function BoardHeader({
  title,
  search,
  onSearch,
}: {
  title: string;
  search: string;
  onSearch: (search: string) => void;
}) {
  const [draft, setDraft] = useState(search);
  useEffect(() => setDraft(search), [search]);
  useEffect(() => {
    if (draft.trim() === search) return;
    const timeout = window.setTimeout(() => onSearch(draft.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [draft, search, onSearch]);
  return (
    <header className={styles.header}>
      <div className={styles.location}>
        <Icon name="board" size={18} />
        <strong title={title}>{title}</strong>
      </div>
      <form
        className={styles.search}
        role="search"
        aria-label="Поиск карточек"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(draft.trim());
        }}
      >
        <Icon name="search" size={17} />
        <input
          type="search"
          aria-label="Найти карточку"
          placeholder="Найти карточку…"
          maxLength={200}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {draft && (
          <button
            type="button"
            aria-label="Очистить поиск"
            onClick={() => {
              setDraft("");
              onSearch("");
            }}
          >
            <Icon name="close" size={15} />
          </button>
        )}
      </form>
      <div
        className={styles.account}
        title="Макет аккаунта: авторизация ещё не подключена"
        aria-label="Аккаунт: Локальный пользователь (макет)"
      >
        <div>
          <strong>Локальный пользователь</strong>
          <small>Демо-аккаунт</small>
        </div>
        <span className={styles.avatar}>ЛП</span>
      </div>
    </header>
  );
}
