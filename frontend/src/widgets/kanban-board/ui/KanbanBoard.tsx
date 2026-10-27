import { useMemo } from "react";
import { columnTree, leafColumns } from "@/entities/board";
import type { BoardStructure, ColumnNode } from "@/entities/board";
import styles from "./KanbanBoard.module.scss";

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

/** Structure only. Cards are intentionally not requested by this widget yet. */
export function KanbanBoard({ structure }: { structure: BoardStructure }) {
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
            <div className={styles.laneHeading}>
              <span className={styles.laneLine} />
              <span>{lane.title || "Основная дорожка"}</span>
            </div>
            <div className={styles.cells}>
              {leaves.map((column) => (
                <div
                  className={styles.cell}
                  key={column.id}
                  aria-label={`${column.title} · ${lane.title || "Основная дорожка"}`}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
