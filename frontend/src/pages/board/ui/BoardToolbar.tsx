import { Icon } from "@/shared/ui/icon";
import type { BoardView } from "@/shared/config";
import styles from "./BoardControls.module.scss";

export function BoardToolbar({
  view,
  archived,
  onView,
  onArchive,
  onAdd,
  canAdd,
}: {
  view: BoardView;
  archived: boolean;
  onView: (view: BoardView) => void;
  onArchive: () => void;
  onAdd: () => void;
  canAdd: boolean;
}) {
  return (
    <div className={styles.toolbar} aria-label="Управление доской">
      <div className={styles.views} role="group" aria-label="Вид доски">
        <button aria-pressed={view === "board"} onClick={() => onView("board")}>
          <Icon name="board" size={17} />
          <span>Доски</span>
        </button>
        <button aria-pressed={view === "lists"} onClick={() => onView("lists")}>
          <Icon name="lists" size={17} />
          <span>Списки</span>
        </button>
      </div>
      <span className={styles.divider} />
      <button
        className={`${styles.archive} ${archived ? styles.activeArchive : ""}`}
        aria-pressed={archived}
        onClick={onArchive}
      >
        <Icon name="archive" size={17} />
        <span>Архив</span>
      </button>
      <button className={styles.add} disabled={!canAdd} onClick={onAdd}>
        <Icon name="plus" size={17} />
        Добавить
      </button>
      {archived && (
        <span className={styles.archiveHint}>Архивные карточки</span>
      )}
    </div>
  );
}
