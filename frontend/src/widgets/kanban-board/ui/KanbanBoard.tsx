import { useCallback, useMemo, useState } from "react";
import { columnTree, leafColumns } from "@/entities/board";
import type { BoardStructure, ColumnNode } from "@/entities/board";
import type { CardFilters } from "@/entities/card";
import type { BoardView } from "@/shared/config";
import styles from "./KanbanBoard.module.scss";
import { CardCell } from "./CardCell";

type Counts = Record<string, number | undefined>;
type CountHandler = (
  columnId: string,
  laneId: string | null,
  total: number | undefined,
) => void;
function columnCount(node: ColumnNode, counts: Counts): number | undefined {
  if (!node.children.length) return counts[node.column.id];
  const children = node.children.map((child) => columnCount(child, counts));
  return children.every((count) => count !== undefined)
    ? children.reduce<number>((sum, count) => sum + count!, 0)
    : undefined;
}
function Heading({
  node,
  counts = {},
  children = true,
}: {
  node: ColumnNode;
  counts?: Counts;
  children?: boolean;
}) {
  const count = columnCount(node, counts);
  return (
    <div
      className={`${styles.headingGroup} ${node.children.length ? "" : styles.leafHeading}`}
    >
      <div className={styles.heading}>
        <span className={styles.columnMarker} />
        <h2 title={node.column.title}>{node.column.title || "Без названия"}</h2>
        <span
          className={styles.count}
          aria-label={`Количество карточек в колонке «${node.column.title}»`}
        >
          {count ?? "…"}
        </span>
        {node.column.wipLimit != null && node.column.wipLimit > 0 && (
          <span
            className={styles.limit}
            title={`Лимит незавершённой работы: ${node.column.wipLimit}`}
          >
            ≤ {node.column.wipLimit}
          </span>
        )}
      </div>
      {children && node.children.length > 0 && (
        <div className={styles.children}>
          {node.children.map((child) => (
            <Heading key={child.column.id} node={child} counts={counts} />
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
  onSelectTag,
  onSelectUser,
  onCount,
  counts,
}: {
  node: ColumnNode;
  structure: BoardStructure;
  filters: CardFilters;
  onOpenCard?: (id: string) => void;
  onSelectTag?: (tag: { id: string; name: string }) => void;
  onSelectUser?: (user: { id: string; name: string }) => void;
  onCount?: CountHandler;
  counts?: Counts;
}) {
  if (node.children.length)
    return (
      <div className={styles.listGroup}>
        <Heading node={node} counts={counts} children={false} />
        <div className={styles.listChildren}>
          {node.children.map((child) => (
            <ListColumn
              key={child.column.id}
              node={child}
              counts={counts}
              structure={structure}
              filters={filters}
              onOpenCard={onOpenCard}
              onSelectTag={onSelectTag}
              onSelectUser={onSelectUser}
              onCount={onCount}
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
      <Heading node={node} counts={counts} />
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
              onSelectTag={onSelectTag}
              onSelectUser={onSelectUser}
              onCount={onCount}
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
  onSelectTag,
  onSelectUser,
  view = "board",
  filters = {},
}: {
  structure: BoardStructure;
  onOpenCard?: (id: string) => void;
  onSelectTag?: (tag: { id: string; name: string }) => void;
  onSelectUser?: (user: { id: string; name: string }) => void;
  view?: BoardView;
  filters?: CardFilters;
}) {
  const countKey = JSON.stringify([structure.board.id, filters]);
  const [cellCounts, setCellCounts] = useState<Record<string, Counts>>({});
  const onCount = useCallback<CountHandler>(
    (columnId, laneId, total) => {
      const id = `${columnId}:${laneId || "default"}`;
      setCellCounts((previous) => {
        const current = previous[countKey] || {};
        if (current[id] === total) return previous;
        return { [countKey]: { ...current, [id]: total } };
      });
    },
    [countKey],
  );
  const counts: Counts = {};
  const laneIds = structure.lanes.length
    ? structure.lanes.map((lane) => lane.id)
    : ["default"];
  for (const column of structure.columns) {
    const values = laneIds.map(
      (lane) => cellCounts[countKey]?.[`${column.id}:${lane}`],
    );
    counts[column.id] = values.every((value) => value !== undefined)
      ? values.reduce<number>((sum, value) => sum + value!, 0)
      : undefined;
  }
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
              counts={counts}
              structure={structure}
              filters={filters}
              onOpenCard={onOpenCard}
              onSelectTag={onSelectTag}
              onSelectUser={onSelectUser}
              onCount={onCount}
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
            <Heading key={node.column.id} node={node} counts={counts} />
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
                  onSelectTag={onSelectTag}
                  onSelectUser={onSelectUser}
                  onCount={onCount}
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
