import { useMemo } from "react";
import { columnTree, leafColumns } from "@/entities/board";
import type { BoardStructure, ColumnNode } from "@/entities/board";
import type { CardFilters } from "@/entities/card";
import type { BoardView } from "@/shared/config";
import styles from "./KanbanBoard.module.scss";
import { CardCell } from "./CardCell";

function Heading({ node }: { node: ColumnNode }) {
  return (
    <div
      className={`${styles.headingGroup} ${node.children.length ? "" : styles.leafHeading}`}
    >
      <div className={styles.heading}>
        <span className={styles.columnMarker} />
        <h2 title={node.column.title}>{node.column.title || "Без названия"}</h2>
        {node.column.wipLimit != null && node.column.wipLimit > 0 && (
          <span
            className={styles.limit}
            title={`Лимит незавершённой работы: ${node.column.wipLimit}`}
          >
            ≤ {node.column.wipLimit}
          </span>
        )}
      </div>
      {node.children.length > 0 && (
        <div className={styles.children}>
          {node.children.map((child) => (
            <Heading key={child.column.id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function ListColumn({
  node,
  structure,
  filters,
  onOpenCard,
}: {
  node: ColumnNode;
  structure: BoardStructure;
  filters: CardFilters;
  onOpenCard?: (id: string) => void;
}) {
  if (node.children.length)
    return (
      <div className={styles.listGroup}>
        <div className={styles.heading}>
          <h2>{node.column.title}</h2>
        </div>
        <div className={styles.listChildren}>
          {node.children.map((child) => (
            <ListColumn
              key={child.column.id}
              node={child}
              structure={structure}
              filters={filters}
              onOpenCard={onOpenCard}
            />
          ))}
        </div>
      </div>
    );
  const lanes = structure.lanes.length
    ? structure.lanes
    : [{ id: "default", title: "", sortOrder: "0" }];
  return (
    <section
      className={styles.listColumn}
      aria-label={`Список «${node.column.title}»`}
    >
      <Heading node={node} />
      <div
        className={styles.columnCards}
        tabIndex={0}
        role="region"
        aria-label={`Карточки колонки «${node.column.title}»`}
      >
        {lanes.map((lane, index) => (
          <div key={lane.id}>
            {lanes.length > 1 && (
              <div className={styles.laneLabel}>
                {lane.title || `Дорожка ${index + 1}`}
              </div>
            )}
            <CardCell
              boardId={structure.board.id}
              columnId={node.column.id}
              laneId={lane.id === "default" ? null : lane.id}
              label={`${node.column.title} · ${lane.title || "Основная дорожка"}`}
              filters={filters}
              onOpen={onOpenCard}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Mounted only after board structure has loaded, then each cell loads its first card page. */
export function KanbanBoard({
  structure,
  onOpenCard,
  view = "board",
  filters = {},
}: {
  structure: BoardStructure;
  onOpenCard?: (id: string) => void;
  view?: BoardView;
  filters?: CardFilters;
}) {
  const tree = useMemo(() => {
    try {
      return { nodes: columnTree(structure.columns), error: null };
    } catch (error) {
      return {
        nodes: [],
        error:
          error instanceof Error
            ? error.message
            : "Не удалось отобразить колонки",
      };
    }
  }, [structure.columns]);
  if (tree.error)
    return (
      <p role="alert" className={styles.structureError}>
        {tree.error}
      </p>
    );
  const leaves = leafColumns(tree.nodes);
  const lanes = structure.lanes.length
    ? structure.lanes
    : [{ id: "default", title: "", sortOrder: "0" }];
  if (!leaves.length)
    return (
      <div className={styles.empty}>
        <h2>В этой доске пока нет колонок</h2>
        <p>Обновите доску после добавления колонок.</p>
      </div>
    );
  if (view === "lists")
    return (
      <div
        className={`${styles.scroll} ${styles.lists}`}
        role="region"
        tabIndex={0}
        aria-label={`Списки доски «${structure.board.title}»`}
      >
        <div className={styles.listCanvas}>
          {tree.nodes.map((node) => (
            <ListColumn
              key={node.column.id}
              node={node}
              structure={structure}
              filters={filters}
              onOpenCard={onOpenCard}
            />
          ))}
        </div>
      </div>
    );
  return (
    <div
      className={styles.scroll}
      role="region"
      tabIndex={0}
      aria-label={`Колонки доски «${structure.board.title}»`}
    >
      <div className={styles.canvas}>
        <div className={styles.headers}>
          {tree.nodes.map((node) => (
            <Heading key={node.column.id} node={node} />
          ))}
        </div>
        {lanes.map((lane, index) => (
          <section
            className={styles.lane}
            key={lane.id}
            aria-label={lane.title || `Дорожка ${index + 1}`}
          >
            <div className={styles.cells}>
              {leaves.map((column) => (
                <CardCell
                  key={column.id}
                  onOpen={onOpenCard}
                  boardId={structure.board.id}
                  columnId={column.id}
                  laneId={lane.id === "default" ? null : lane.id}
                  label={`${column.title} · ${lane.title || "Основная дорожка"}`}
                  filters={filters}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
