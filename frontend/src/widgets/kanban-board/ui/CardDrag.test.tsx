import { afterEach, expect, it, vi } from "vitest";
import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cardApi } from "@/entities/card";
import { CardCell } from "./CardCell";
import { CardDragProvider } from "./CardDragContext";

afterEach(() => vi.restoreAllMocks());
const card = {
  id: "one",
  number: "1",
  title: "Заказ",
  columnId: "source",
  laneId: "lane",
  sortOrder: "0.0000000000000000000000001",
  version: 4,
  asap: false,
  tags: [],
  cover: null,
};
const second = {
  ...card,
  id: "two",
  number: "2",
  title: "Сосед",
  columnId: "target",
};
function mount(archived = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.spyOn(cardApi, "cell").mockImplementation(async (_board, column) => ({
    items: column === "source" ? [card] : [second],
    nextCursor: column === "target" ? "more-hidden-cards" : null,
    total: 1,
  }));
  render(
    <QueryClientProvider client={client}>
      <CardDragProvider boardId="board" archived={archived}>
        <CardCell
          boardId="board"
          columnId="source"
          laneId="lane"
          label="Источник"
        />
        <CardCell
          boardId="board"
          columnId="target"
          laneId="lane"
          label="Цель"
        />
      </CardDragProvider>
    </QueryClientProvider>,
  );
}
function transfer() {
  return { effectAllowed: "", dropEffect: "", setData: vi.fn() };
}
function dragAt(
  type: "dragOver" | "drop",
  target: Element,
  dataTransfer: ReturnType<typeof transfer>,
  clientY: number,
) {
  const event = createEvent[type](target, { dataTransfer });
  Object.defineProperty(event, "clientY", { value: clientY });
  fireEvent(target, event);
}

it("shows insertion before a card and sends its ID without rounding positions", async () => {
  const move = vi.spyOn(cardApi, "move").mockResolvedValue({ id: "one" });
  mount();
  const source = (
    await screen.findByRole("heading", { name: "Заказ" })
  ).closest("[data-card-id]")!;
  const neighbour = (
    await screen.findByRole("heading", { name: "Сосед" })
  ).closest("[data-card-id]")!;
  vi.spyOn(neighbour, "getBoundingClientRect").mockReturnValue({
    top: 100,
    height: 100,
  } as DOMRect);
  const target = screen.getByLabelText("Цель");
  const dataTransfer = transfer();
  fireEvent.dragStart(source, { dataTransfer });
  dragAt("dragOver", target, dataTransfer, 110);
  expect(screen.getByText("Вставить сюда")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Место вставки: Цель");
  dragAt("drop", target, dataTransfer, 110);
  await waitFor(() =>
    expect(move).toHaveBeenCalledWith(
      "one",
      expect.objectContaining({
        version: 4,
        columnId: "target",
        laneId: "lane",
        beforeCardId: "two",
      }),
    ),
  );
  await waitFor(() =>
    expect(screen.queryByText("Сохраняем…")).not.toBeInTheDocument(),
  );
});

it("inserts after the last loaded card instead of appending behind unloaded cards", async () => {
  const move = vi.spyOn(cardApi, "move").mockResolvedValue({ id: "one" });
  mount();
  const source = (
    await screen.findByRole("heading", { name: "Заказ" })
  ).closest("[data-card-id]")!;
  await screen.findByRole("heading", { name: "Сосед" });
  const dataTransfer = transfer();
  fireEvent.dragStart(source, { dataTransfer });
  dragAt("drop", screen.getByLabelText("Цель"), dataTransfer, 1000);
  await waitFor(() =>
    expect(move).toHaveBeenCalledWith(
      "one",
      expect.objectContaining({ afterCardId: "two" }),
    ),
  );
  await waitFor(() =>
    expect(screen.queryByText("Сохраняем…")).not.toBeInTheDocument(),
  );
});

it("cancels a drag without a write and disables archived card dragging", async () => {
  const move = vi.spyOn(cardApi, "move");
  mount(true);
  const source = (
    await screen.findByRole("heading", { name: "Заказ" })
  ).closest("[data-card-id]")!;
  expect(source).toHaveAttribute("draggable", "false");
  fireEvent.dragStart(source, { dataTransfer: transfer() });
  fireEvent.drop(screen.getByLabelText("Цель"), { dataTransfer: transfer() });
  expect(move).not.toHaveBeenCalled();
});
