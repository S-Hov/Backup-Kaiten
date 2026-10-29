import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { boardApi } from "@/entities/board";
import { BoardPage } from "./BoardPage";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const summary = {
  id: a,
  title: "Производство",
  description: null,
  sourceId: "437516",
};
beforeEach(() => vi.restoreAllMocks());
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <BoardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
describe("working board homepage", () => {
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
    await userEvent.click(
      screen.getByRole("button", { name: "Архив" }),
    );
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
