import { expect, it } from "vitest";
import { readBoardLocation, routeUrls, updateBoardParams } from "./routes";

it("round-trips board view, search, archive and card IDs with encoded query characters", () => {
  const state = {
    board: "board-id",
    card: "card-id",
    view: "lists" as const,
    archived: true,
    search: "Чай & кофе",
  };
  const url = routeUrls.board(state);
  expect(
    readBoardLocation(new URL(url, "https://example.test").searchParams),
  ).toEqual(state);
  expect(routeUrls.board()).toBe("/");
  expect(routeUrls.archive("?snapshot=s&card=42")).toBe(
    "/archive?snapshot=s&card=42",
  );
});
it("updates one setting without discarding the others and removes default values", () => {
  const previous = new URLSearchParams(
    "board=b&cardId=c&archived=1&q=hello&custom=kept",
  );
  const next = updateBoardParams(previous, { view: "lists", card: "" });
  expect(next.get("board")).toBe("b");
  expect(next.get("q")).toBe("hello");
  expect(next.get("archived")).toBe("1");
  expect(next.get("custom")).toBe("kept");
  expect(next.has("cardId")).toBe(false);
  expect(
    updateBoardParams(next, { view: "board", archived: false }).has("view"),
  ).toBe(false);
  expect(previous.get("cardId")).toBe("c");
});
