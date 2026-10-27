import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { boardQueries } from "@/entities/board";
import { KanbanBoard } from "@/widgets/kanban-board";
import { Icon } from "@/shared/ui/icon";
import styles from "./BoardPage.module.scss";

function LoadingBoard() {
  return (
    <div className={styles.loading} role="status">
      <span>Загружаем колонки…</span>
      <div className={styles.skeletons}>
        {[1, 2, 3, 4, 5].map((value) => (
          <div key={value}>
            <i />
            <b />
            <b />
            <b />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BoardPage() {
  const [params, setParams] = useSearchParams();
  const [collapsed, setCollapsed] = useState(true);
  const boards = useQuery(boardQueries.list());
  const selected = params.get("board") || boards.data?.[0]?.id || "";
  const structure = useQuery({
    ...boardQueries.structure(selected),
    enabled: !!selected && boards.isSuccess,
  });
  const current = boards.data?.find((board) => board.id === selected);
  useEffect(() => {
    document.title = `${current?.title || "Доска"} · Заказы`;
  }, [current?.title]);

  function selectBoard(id: string) {
    setParams({ board: id });
  }
  function refresh() {
    void boards.refetch();
    if (selected) void structure.refetch();
  }
  const error = boards.error || structure.error;

  return (
    <div className={`${styles.shell} ${collapsed ? styles.compact : ""}`}>
      <aside className={styles.sidebar} aria-label="Навигация">
        <div className={styles.brandRow}>
          <Link className={styles.brand} to="/" aria-label="Заказы — главная">
            <b>Заказы</b>
          </Link>
          <button
            className={styles.collapseButton}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
            aria-expanded={!collapsed}
          >
            <Icon name="menu" size={18} />
          </button>
        </div>
        <div className={styles.workspaceLabel}>
          <span className={styles.workspaceAvatar}>П</span>
          <div>
            <strong>Рабочее пространство</strong>
            <small>Заказы компании</small>
          </div>
        </div>
        <div className={styles.sectionLabel}>РАБОТА</div>
        <Link to="/" className={styles.currentNav}>
          <Icon name="board" size={18} />
          <span>Доски</span>
        </Link>
        <div className={styles.boardListLabel}>МОИ ДОСКИ</div>
        <nav className={styles.boardList} aria-label="Доски">
          {boards.data?.map((board) => (
            <button
              key={board.id}
              onClick={() => selectBoard(board.id)}
              className={selected === board.id ? styles.selectedBoard : ""}
              aria-current={selected === board.id ? "page" : undefined}
              title={board.title}
            >
              <span className={styles.boardDot} />
              <span>{board.title || "Без названия"}</span>
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <Link to="/archive" title="Архив карточек">
            <Icon name="archive" size={18} />
            <span>Архив карточек</span>
            <Icon name="chevron" size={14} />
          </Link>
          <small>Локальная доска</small>
        </div>
      </aside>
      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.breadcrumb}>
            <Icon name="board" size={17} />
            <span>Доски</span>
            <Icon name="chevron" size={12} />
            <span>{current?.title || "Рабочая доска"}</span>
          </div>
        </header>
        <main className={styles.workspace} aria-label="Рабочая доска">
          {error ? (
            <div className={styles.message} role="alert">
              <Icon name="alert" size={30} />
              <h2>Не удалось загрузить доску</h2>
              <p>{error.message}</p>
              <button onClick={refresh}>Повторить запрос</button>
            </div>
          ) : boards.isPending ? (
            <LoadingBoard />
          ) : !boards.data?.length ? (
            <div className={styles.message}>
              <Icon name="board" size={36} />
              <h2>Досок пока нет</h2>
              <p>Доски появятся после загрузки данных.</p>
              <button onClick={refresh}>Обновить</button>
            </div>
          ) : structure.isPending ? (
            <LoadingBoard />
          ) : (
            structure.data && <KanbanBoard structure={structure.data} />
          )}
        </main>
      </div>
    </div>
  );
}
