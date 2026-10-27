import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
    defaultOptions: { queries: { retry: false } },
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
  it("requests structure and renders real columns and lanes without requesting cards", async () => {
    vi.spyOn(boardApi, "list").mockResolvedValue([summary]);
    const structure = vi.spyOn(boardApi, "structure").mockResolvedValue({
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
    mount();
    expect(
      await screen.findByRole("heading", { name: "ПОДГОТОВКА" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ПЕЧАТЬ" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Срочные" })).toBeInTheDocument();
    expect(structure).toHaveBeenCalledWith(a, expect.any(AbortSignal));
    await userEvent.click(
      screen.getByRole("button", { name: "Развернуть меню" }),
    );
    expect(
      screen.getByRole("button", { name: "Свернуть меню" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Архив карточек" }),
    ).toHaveAttribute("href", "/archive");
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
