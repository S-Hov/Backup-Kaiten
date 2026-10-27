import { describe, expect, it } from "vitest";
import { columnTree, leafColumns } from "./column-tree";
import type { BoardColumn } from "../api/board.schema";

const col = (id: string, parentId: string | null = null): BoardColumn => ({
  id,
  parentId,
  title: id,
  sortOrder: "1.00000000000000001",
  type: 2,
  wipLimit: null,
});
describe("column hierarchy", () => {
  it("preserves server order and nests subcolumns even when a child arrives first", () => {
    const nodes = columnTree([
      col("child", "parent"),
      col("next"),
      col("parent"),
    ]);
    expect(nodes.map((node) => node.column.id)).toEqual(["next", "parent"]);
    expect(leafColumns(nodes).map((column) => column.id)).toEqual([
      "next",
      "child",
    ]);
  });
  it("retains columns whose parent is missing and rejects multi-level cycles", () => {
    expect(columnTree([col("orphan", "missing")])[0].column.id).toBe("orphan");
    expect(() => columnTree([col("a", "b"), col("b", "a")])).toThrow(/цикл/);
  });
});
