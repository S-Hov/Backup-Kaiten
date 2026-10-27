import type { BoardColumn } from "../api/board.schema";

export interface ColumnNode {
  column: BoardColumn;
  children: ColumnNode[];
}

/** Keep server order (decimal sort order is deliberately never parsed as float). */
export function columnTree(columns: BoardColumn[]): ColumnNode[] {
  const nodes = new Map(
    columns.map((column) => [
      column.id,
      { column, children: [] as ColumnNode[] },
    ]),
  );
  const roots: ColumnNode[] = [];
  for (const column of columns) {
    const node = nodes.get(column.id)!;
    let ancestor = column.parentId;
    const seen = new Set([column.id]);
    while (ancestor && nodes.has(ancestor)) {
      if (seen.has(ancestor))
        throw new Error(
          "В структуре колонок обнаружен цикл. Обновите данные доски.",
        );
      seen.add(ancestor);
      ancestor = nodes.get(ancestor)!.column.parentId;
    }
    const parent = column.parentId ? nodes.get(column.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
export function leafColumns(nodes: ColumnNode[]): BoardColumn[] {
  return nodes.flatMap((node) =>
    node.children.length ? leafColumns(node.children) : [node.column],
  );
}
