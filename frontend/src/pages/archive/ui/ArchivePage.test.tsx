import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ArchivePage } from "./ArchivePage";
import { archiveApi as api } from "@/entities/archive";
import { cardFixture } from "@/test/fixture";

vi.mock("@/entities/archive", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/archive")>()),
  archiveApi: { snapshots: vi.fn(), cards: vi.fn(), card: vi.fn() },
}));
beforeEach(() => {
  history.replaceState({}, "", "/");
  vi.resetAllMocks();
  vi.mocked(api.snapshots).mockResolvedValue([
    {
      id: "copy-a",
      boardId: 7,
      cards: 1,
      files: 1,
      date: null,
      status: "partial",
      issues: 1,
    },
    {
      id: "copy-b",
      boardId: 8,
      cards: 1,
      files: 1,
      date: null,
      status: "complete",
      issues: 0,
    },
  ]);
  vi.mocked(api.cards).mockResolvedValue({
    items: [{ id: 123, title: "Заказ из списка", archived: false }],
    total: 1,
    offset: 0,
    limit: 40,
  });
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <ArchivePage />
      </BrowserRouter>
    </QueryClientProvider>,
  );
}
describe("archive navigation", () => {
  it("searches by card number and opens a direct link", async () => {
    vi.mocked(api.card).mockResolvedValue(cardFixture());
    mount();
    await screen.findByRole("button", { name: /Заказ из списка/ });
    await userEvent.type(
      screen.getByLabelText("Номер или название карточки"),
      "#123",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Найти карточку" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Заказ 123" }),
    ).toBeInTheDocument();
    expect(new URLSearchParams(location.search).get("card")).toBe("123");
    expect(api.cards).toHaveBeenCalledWith(
      "copy-a",
      "123",
      0,
      expect.any(AbortSignal),
    );
  });
  it("does not show a late card response after switching snapshots", async () => {
    let resolve!: (value: ReturnType<typeof cardFixture>) => void;
    vi.mocked(api.card).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    history.replaceState({}, "", "/?snapshot=copy-a&card=123");
    mount();
    await waitFor(() => expect(api.card).toHaveBeenCalled());
    await userEvent.selectOptions(
      screen.getByLabelText("Резервная копия"),
      "copy-b",
    );
    resolve(cardFixture());
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Заказ 123" }),
      ).not.toBeInTheDocument(),
    );
    expect(new URLSearchParams(location.search).get("snapshot")).toBe("copy-b");
    expect(
      screen.getByRole("heading", { name: "Заказы под рукой" }),
    ).toBeInTheDocument();
  });
});
