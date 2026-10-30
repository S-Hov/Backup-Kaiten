import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { boardApi } from "@/entities/board";
import { cardApi } from "@/entities/card";
import { BoardPage } from "./BoardPage";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const summary = {
  id: a,
  title: "Производство",
  description: null,
  sourceId: "437516",
};
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
function mount(url = "/") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={client}>
        <BoardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
describe("working board homepage", () => {
  it("filters by a clicked tag, combines filters and clears them together", async () => {
    vi.spyOn(boardApi, "list").mockResolvedValue([summary]);
    vi.spyOn(boardApi, "structure").mockResolvedValue({
      board: summary,
      columns: [
        {
          id: a,
          title: "Печать",
          parentId: null,
          sortOrder: "0",
          type: 2,
          wipLimit: null,
        },
      ],
      lanes: [],
    });
    const cell = vi.spyOn(cardApi, "cell").mockResolvedValue({
      items: [
        {
          id: a,
          number: "42",
          title: "Заказ",
          columnId: a,
          laneId: null,
          sortOrder: "1",
          version: 1,
          asap: false,
          cover: null,
          tags: [
            { id: b, name: "Срочно", color: "16" },
            { id: a, name: "Деколь", color: "1" },
          ],
        },
      ],
      nextCursor: null,
    });
    mount();
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Фильтровать по метке «Срочно»",
      }),
    );
    expect(
      screen.getByRole("region", { name: "Активные фильтры" }),
    ).toHaveTextContent("Срочно");
    await waitFor(() =>
      expect(cell).toHaveBeenLastCalledWith(
        a,
        a,
        null,
        null,
        expect.objectContaining({ tags: [b] }),
        expect.any(AbortSignal),
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Фильтровать по метке «Срочно»" }),
    );
    expect(
      screen.queryByRole("region", { name: "Активные фильтры" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Фильтровать по метке «Срочно»" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Фильтровать по метке «Деколь»" }),
    );
    await waitFor(() =>
      expect(cell).toHaveBeenLastCalledWith(
        a,
        a,
        null,
        null,
        expect.objectContaining({ tags: [b, a] }),
        expect.any(AbortSignal),
      ),
    );
    expect(
      screen.getByRole("region", { name: "Активные фильтры" }),
    ).toHaveTextContent("Деколь");
    expect(
      screen.getByRole("button", { name: "Фильтровать по метке «Деколь»" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(
      screen.getByRole("button", { name: "Убрать фильтр «Метка: Деколь»" }),
    );
    expect(
      screen.getByRole("region", { name: "Активные фильтры" }),
    ).toHaveTextContent("Срочно");
    await userEvent.click(screen.getByRole("button", { name: "Списки" }));
    await userEvent.click(screen.getByRole("button", { name: "Архив" }));
    await userEvent.type(screen.getByRole("searchbox"), "Заказ{Enter}");
    await waitFor(() =>
      expect(cell).toHaveBeenLastCalledWith(
        a,
        a,
        null,
        null,
        { tags: [b], search: "Заказ", archived: true },
        expect.any(AbortSignal),
      ),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Убрать фильтр «Метка: Срочно»" }),
    );
    expect(
      screen.getByRole("region", { name: "Активные фильтры" }),
    ).toHaveTextContent("«Заказ»");
    expect(screen.queryByText("Метка: Срочно")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Очистить" }));
    expect(
      screen.queryByRole("region", { name: "Активные фильтры" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Архив" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Списки" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
  it("switches views while reusing cards and sends archive/search filters to the API", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ items: [], nextCursor: null })),
      );
    vi.spyOn(boardApi, "list").mockResolvedValue([summary]);
    vi.spyOn(boardApi, "structure").mockResolvedValue({
      board: summary,
      columns: [a, b].map((id, index) => ({
        id,
        title: index ? "Готово" : "Печать",
        parentId: null,
        sortOrder: String(index),
        type: 2,
        wipLimit: null,
      })),
      lanes: [{ id: a, title: "Основная", sortOrder: "0" }],
    });
    mount();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole("button", { name: "Списки" }));
    expect(
      screen.getByRole("region", { name: "Списки доски «Производство»" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Карточки колонки «Печать»" }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "Архив" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(String(fetch.mock.calls[3][0])).toContain("archived=true");
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Найти карточку" }),
      "Чай",
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    const url = new URL(String(fetch.mock.calls[5][0]), "https://example.test");
    expect(url.searchParams.get("q")).toBe("Чай");
    expect(url.searchParams.get("archived")).toBe("true");
    expect(
      screen.getByLabelText("Аккаунт: Локальный пользователь (макет)"),
    ).toBeInTheDocument();
  });
  it("requests cards only after structure and renders real columns and lanes", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ items: [], nextCursor: null })),
      );
    vi.spyOn(boardApi, "list").mockResolvedValue([summary]);
    let finishStructure!: (
      value: Awaited<ReturnType<typeof boardApi.structure>>,
    ) => void;
    const structure = vi.spyOn(boardApi, "structure").mockImplementation(
      () =>
        new Promise((resolve) => {
          finishStructure = resolve;
        }),
    );
    mount();
    await waitFor(() => expect(structure).toHaveBeenCalled());
    expect(fetch).not.toHaveBeenCalled();
    finishStructure({
      board: summary,
      columns: [
        {
          id: a,
          title: "ПОДГОТОВКА",
          parentId: null,
          sortOrder: "1",
          type: 2,
          wipLimit: 4,
        },
        {
          id: b,
          title: "ПЕЧАТЬ",
          parentId: null,
          sortOrder: "2",
          type: 2,
          wipLimit: null,
        },
      ],
      lanes: [{ id: a, title: "Срочные", sortOrder: "1" }],
    });
    expect(
      await screen.findByRole("heading", { name: "ПОДГОТОВКА" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ПЕЧАТЬ" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Срочные" })).toBeInTheDocument();
    expect(structure).toHaveBeenCalledWith(a, expect.any(AbortSignal));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(String(fetch.mock.calls[0][0])).toContain(
      `/boards/${a}/cards?column_id=${a}&lane_id=${a}`,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Развернуть меню" }),
    );
    expect(
      screen.getByRole("button", { name: "Свернуть меню" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Архив копий" })).toHaveAttribute(
      "href",
      "/archive",
    );
  });
  it("has a useful empty state when the working database has no boards", async () => {
    vi.spyOn(boardApi, "list").mockResolvedValue([]);
    const structure = vi.spyOn(boardApi, "structure");
    mount();
    expect(
      await screen.findByRole("heading", { name: "Досок пока нет" }),
    ).toBeInTheDocument();
    expect(structure).not.toHaveBeenCalled();
  });
  it("shows an error and retries the list request", async () => {
    vi.spyOn(boardApi, "list")
      .mockRejectedValueOnce(new Error("Нет связи"))
      .mockResolvedValue([]);
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Нет связи");
    await userEvent.click(
      screen.getByRole("button", { name: "Повторить запрос" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Досок пока нет" }),
    ).toBeInTheDocument();
  });
});

it("restores the view, lets an explicit URL override it and saves subsequent choices", async () => {
  vi.spyOn(boardApi, "list").mockResolvedValue([]);
  localStorage.setItem("board-view", "lists");
  const first = mount();
  expect(screen.getByRole("button", { name: "Списки" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  first.unmount();
  mount("/?view=board");
  expect(screen.getByRole("button", { name: "Доски" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(localStorage.getItem("board-view")).toBe("board");
  await userEvent.click(screen.getByRole("button", { name: "Списки" }));
  expect(localStorage.getItem("board-view")).toBe("lists");
});

it("combines avatar and date filters with search and updates the complete column count", async () => {
  vi.spyOn(boardApi, "list").mockResolvedValue([summary]);
  vi.spyOn(boardApi, "structure").mockResolvedValue({
    board: summary,
    lanes: [],
    columns: [
      {
        id: a,
        title: "Печать",
        parentId: null,
        sortOrder: "0",
        type: 2,
        wipLimit: null,
      },
    ],
  });
  const cell = vi
    .spyOn(cardApi, "cell")
    .mockImplementation(async (_board, _column, _lane, _cursor, filters) => ({
      total: filters?.search ? 0 : filters?.users?.length ? 3 : 42,
      items: filters?.search
        ? []
        : [
            {
              id: a,
              title: "Заказ",
              number: "1",
              columnId: a,
              laneId: null,
              sortOrder: "1",
              version: 1,
              asap: false,
              cover: null,
              tags: [],
              members: [
                {
                  id: b,
                  name: "Анна",
                  avatarUrl: `/api/v1/users/${b}/avatar?v=${a}`,
                },
              ],
            },
          ],
      nextCursor: null,
    }));
  mount();
  await waitFor(() =>
    expect(
      screen.getByLabelText("Количество карточек в колонке «Печать»"),
    ).toHaveTextContent("42"),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Фильтровать по пользователю «Анна»" }),
  );
  await waitFor(() =>
    expect(
      screen.getByLabelText("Количество карточек в колонке «Печать»"),
    ).toHaveTextContent("3"),
  );
  expect(
    screen.getByRole("region", { name: "Активные фильтры" }),
  ).toHaveTextContent("Анна");
  const filters = screen.getByRole("region", { name: "Активные фильтры" });
  expect(filters.querySelector("img")).toHaveAttribute(
    "src",
    `/api/v1/users/${b}/avatar?v=${a}`,
  );
  await userEvent.click(within(filters).getByText("Анна"));
  expect(
    within(filters).getByRole("button", {
      name: "Убрать фильтр «Пользователь: Анна»",
    }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await userEvent.click(screen.getByText("Дата"));
  await userEvent.selectOptions(screen.getByLabelText("Поле даты"), "due");
  // Native date fields accept complete ISO dates.
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.change(screen.getByLabelText("С"), {
    target: { value: "2026-10-01" },
  });
  fireEvent.change(screen.getByLabelText("По"), {
    target: { value: "2026-10-30" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Применить" }));
  await waitFor(() =>
    expect(cell).toHaveBeenLastCalledWith(
      a,
      a,
      null,
      null,
      expect.objectContaining({
        users: [b],
        dateField: "due",
        dateFrom: "2026-10-01",
        dateTo: "2026-10-30",
      }),
      expect.any(AbortSignal),
    ),
  );
  expect(
    screen.getByRole("region", { name: "Активные фильтры" }),
  ).toHaveTextContent("Срок выполнения01.10.2026 — 30.10.2026");
  await userEvent.click(screen.getByRole("button", { name: "Списки" }));
  await userEvent.type(screen.getByRole("searchbox"), "нет{Enter}");
  await waitFor(() =>
    expect(
      screen.getByLabelText("Количество карточек в колонке «Печать»"),
    ).toHaveTextContent("0"),
  );
  await userEvent.click(screen.getByRole("button", { name: "Очистить" }));
  await waitFor(() =>
    expect(
      screen.getByLabelText("Количество карточек в колонке «Печать»"),
    ).toHaveTextContent("42"),
  );
  expect(
    screen.queryByRole("region", { name: "Активные фильтры" }),
  ).not.toBeInTheDocument();
});
