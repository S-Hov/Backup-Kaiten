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
  dateField,
  dateFrom,
  dateTo,
  onDate,
  hasFilters,
  onOpenFilters,
}: {
  hasFilters: boolean;
  onOpenFilters: () => void;
  view: BoardView;
  archived: boolean;
  onView: (view: BoardView) => void;
  onArchive: () => void;
  onAdd: () => void;
  canAdd: boolean;
  dateField: "created" | "updated" | "due";
  dateFrom: string;
  dateTo: string;
  onDate: (patch: {
    dateField: "created" | "updated" | "due";
    dateFrom: string;
    dateTo: string;
  }) => void;
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
      <details className={styles.dateFilter}>
        <summary>Дата{dateFrom || dateTo ? " •" : ""}</summary>
        <form
          key={`${dateField}:${dateFrom}:${dateTo}`}
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            const from = String(data.get("from") || "");
            const to = String(data.get("to") || "");
            const input = form.elements.namedItem("to") as HTMLInputElement;
            input.setCustomValidity(
              from && to && from > to
                ? "Начало периода должно быть не позже окончания"
                : "",
            );
            if (!form.reportValidity()) return;
            onDate({
              dateField: data.get("field") as "created" | "updated" | "due",
              dateFrom: from,
              dateTo: to,
            });
            form.closest("details")?.removeAttribute("open");
          }}
        >
          <label>
            Поле даты
            <select name="field" defaultValue={dateField}>
              <option value="created">Дата создания</option>
              <option value="updated">Дата обновления</option>
              <option value="due">Срок выполнения</option>
            </select>
          </label>
          <label>
            С
            <input
              type="date"
              name="from"
              defaultValue={dateFrom}
              onChange={(event) => {
                const input = event.currentTarget.form?.elements.namedItem(
                  "to",
                ) as HTMLInputElement;
                input?.setCustomValidity("");
              }}
            />
          </label>
          <label>
            По
            <input
              type="date"
              name="to"
              defaultValue={dateTo}
              onChange={(event) => event.currentTarget.setCustomValidity("")}
            />
          </label>
          <button type="submit">Применить</button>
        </form>
      </details>
      {!hasFilters && (
        <button
          className={styles.archive}
          onClick={onOpenFilters}
          aria-haspopup="dialog"
        >
          <Icon name="filter" size={17} />
          Фильтр
        </button>
      )}
      <button className={styles.add} disabled={!canAdd} onClick={onAdd}>
        <Icon name="plus" size={17} />
        Добавить
      </button>
    </div>
  );
}
