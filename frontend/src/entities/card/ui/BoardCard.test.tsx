import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BoardCard } from "./BoardCard";
import type { CardPreview } from "../api/card.schema";

const card: CardPreview = {
  id: "11111111-1111-4111-8111-111111111111",
  number: "42",
  title: "Заказ на посуду",
  columnId: null,
  laneId: null,
  sortOrder: "1",
  version: 1,
  asap: false,
  tags: [
    { id: "22222222-2222-4222-8222-222222222222", name: "Деколь", color: "16" },
  ],
  cover: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Макет.png",
    url: "/api/v1/attachments/33333333-3333-4333-8333-333333333333/image",
    explicit: true,
  },
};
it("renders supplied title, stable tag color and lazy cover without fetching data", () => {
  render(<BoardCard card={card} />);
  expect(screen.getByRole("heading", { name: card.title })).toBeInTheDocument();
  expect(screen.getByText("Деколь")).toHaveAttribute("data-color", "16");
  expect(screen.getByRole("img")).toHaveAttribute("loading", "lazy");
  expect(screen.getByText("#42")).toBeInTheDocument();
});
it("keeps the card usable when an image is missing and resets on a new cover", () => {
  const { rerender } = render(<BoardCard card={card} />);
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByText("Изображение недоступно")).toBeInTheDocument();
  rerender(
    <BoardCard
      card={{
        ...card,
        cover: {
          ...card.cover!,
          url: "/api/v1/attachments/44444444-4444-4444-8444-444444444444/image",
        },
      }}
    />,
  );
  expect(screen.getByRole("img")).toBeInTheDocument();
});
it("delegates opening to the caller and works without tags or a cover", () => {
  const onOpen = vi.fn();
  render(
    <BoardCard card={{ ...card, tags: [], cover: null }} onOpen={onOpen} />,
  );
  fireEvent.click(screen.getByRole("button"));
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: card.id }));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("selects a tag without opening the card and keeps buttons separate", () => {
  const onOpen = vi.fn();
  const onSelectTag = vi.fn();
  render(<BoardCard card={card} onOpen={onOpen} onSelectTag={onSelectTag} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Фильтровать по метке «Деколь»" }),
  );
  expect(onSelectTag).toHaveBeenCalledWith(card.tags[0]);
  expect(onOpen).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("button", { name: "Открыть карточку 42" })
      .querySelector("button"),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Открыть карточку 42" }));
  expect(onOpen).toHaveBeenCalledWith(card);
});
