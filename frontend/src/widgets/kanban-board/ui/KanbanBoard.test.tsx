import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cardApi } from "@/entities/card";
import { KanbanBoard } from "./KanbanBoard";
afterEach(() => vi.restoreAllMocks());
it("sums all lanes and child columns in both views and replaces counts when filters change", async () => {
  const structure = {
    board: { id: "board", title: "Доска", description: null, sourceId: null },
    columns: [
      {
        id: "parent",
        parentId: null,
        title: "Печать",
        sortOrder: "0",
        type: 2,
        wipLimit: null,
      },
      {
        id: "child",
        parentId: "parent",
        title: "В процессе",
        sortOrder: "1",
        type: 2,
        wipLimit: null,
      },
      {
        id: "other",
        parentId: "parent",
        title: "Готово",
        sortOrder: "2",
        type: 2,
        wipLimit: null,
      },
    ],
    lanes: [
      { id: "a", title: "Обычные", sortOrder: "1" },
      { id: "b", title: "Срочные", sortOrder: "2" },
    ],
  };
  const api = vi
    .spyOn(cardApi, "cell")
    .mockImplementation(async (_board, column, lane, _cursor, filters) => ({
      items: [],
      nextCursor: null,
      total: filters?.search
        ? 0
        : (column === "child" ? 10 : 20) + (lane === "a" ? 1 : 2),
    }));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const view = (mode: "board" | "lists", search = "") => (
    <QueryClientProvider client={client}>
      <KanbanBoard structure={structure} view={mode} filters={{ search }} />
    </QueryClientProvider>
  );
  const { rerender } = render(view("board"));
  const count = (title: string) =>
    screen.getByLabelText(`Количество карточек в колонке «${title}»`);
  await waitFor(() => expect(count("Печать")).toHaveTextContent("66"));
  expect(count("В процессе")).toHaveTextContent("23");
  expect(count("Готово")).toHaveTextContent("43");
  rerender(view("lists"));
  await waitFor(() => expect(count("Печать")).toHaveTextContent("66"));
  expect(api).toHaveBeenCalledTimes(4);
  rerender(view("lists", "нет совпадений"));
  await waitFor(() => expect(count("Печать")).toHaveTextContent("0"));
  expect(count("В процессе")).toHaveTextContent("0");
  rerender(view("board"));
  await waitFor(() => expect(count("Печать")).toHaveTextContent("66"));
});
