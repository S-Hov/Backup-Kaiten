import { Link } from "react-router-dom";
import type { BoardSummary } from "@/entities/board";
import { routePaths } from "@/shared/config";
import { Icon } from "@/shared/ui/icon";
import styles from "./BoardPage.module.scss";
export function BoardSidebar({
  boards,
  selected,
  collapsed,
  onToggle,
  onSelect,
}: {
  boards: BoardSummary[];
  selected: string;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className={styles.sidebar} aria-label="Навигация">
      <div className={styles.brandRow}>
        <Link
          className={styles.brand}
          to={routePaths.board}
          aria-label="Заказы — главная"
        >
          <b>Заказы</b>
        </Link>
        <button
          className={styles.collapseButton}
          onClick={onToggle}
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
      <Link to={routePaths.board} className={styles.currentNav}>
        <Icon name="board" size={18} />
        <span>Доски</span>
      </Link>
      <div className={styles.boardListLabel}>МОИ ДОСКИ</div>
      <nav className={styles.boardList} aria-label="Доски">
        {boards.map((board) => (
          <button
            key={board.id}
            onClick={() => onSelect(board.id)}
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
        <Link to={routePaths.archive} title="Архив копий">
          <Icon name="archive" size={18} />
          <span>Архив копий</span>
          <Icon name="chevron" size={14} />
        </Link>
        <small>Локальная доска</small>
      </div>
    </aside>
  );
}
