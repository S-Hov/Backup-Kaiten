import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CardCell } from "./CardCell";

afterEach(() => vi.restoreAllMocks());
const id = "11111111-1111-4111-8111-111111111111";
const item = {
  id,
  number: "42",
  title: "Первый заказ",
  columnId: id,
  laneId: id,
  sortOrder: "1",
  version: 1,
  asap: false,
  tags: [],
  cover: null,
};
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CardCell boardId={id} columnId={id} laneId={id} label="Печать" />
    </QueryClientProvider>,
  );
}
it("loads the next cursor page and deduplicates overlapping cards", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [item], nextCursor: "cursor-1" })),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            item,
            {
              ...item,
              id: "22222222-2222-4222-8222-222222222222",
              title: "Второй заказ",
            },
          ],
          nextCursor: null,
        }),
      ),
    );
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Показать ещё" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Второй заказ" }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { name: "Первый заказ" })).toHaveLength(
    1,
  );
  expect(String(fetch.mock.calls[1][0])).toContain("cursor=cursor-1");
});
it("retains the first page when loading more fails and can retry", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [item], nextCursor: "cursor-1" })),
    )
    .mockRejectedValueOnce(new Error("Нет связи"))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], nextCursor: null })),
    );
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Показать ещё" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Нет связи");
  expect(
    screen.getByRole("heading", { name: "Первый заказ" }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Повторить" }));
  expect(
    await screen.findByRole("heading", { name: "Первый заказ" }),
  ).toBeInTheDocument();
});
