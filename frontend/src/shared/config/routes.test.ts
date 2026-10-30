import { expect, it } from "vitest";
import { readBoardLocation, routeUrls, updateBoardParams } from "./routes";

it("round-trips board view, search, archive and card IDs with encoded query characters", () => {
  const state = {
    board: "board-id",
    card: "card-id",
    view: "lists" as const,
    archived: true,
    search: "Чай & кофе",
    users: [{ id: "user-id", name: "Анна & Иван" }],
    dateField: "due" as const,
    dateFrom: "2026-10-01",
    dateTo: "2026-10-30",
    tags: [
      { id: "tag-id", name: "! Срочно !" },
      { id: "tag-2", name: "Печать" },
    ],
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

it("keeps avatar URLs aligned with users without photos when links are reopened", () => {
  const users = [
    { id: "one", name: "Без фото" },
    {
      id: "two",
      name: "С фото",
      avatarUrl: "/api/v1/users/two/avatar?v=version",
    },
    { id: "three", name: "Третий" },
  ];
  const params = updateBoardParams(new URLSearchParams(), { users });
  expect(readBoardLocation(params).users).toEqual(users);
  const remaining = updateBoardParams(params, { users: [users[0], users[2]] });
  expect(remaining.has("userAvatar")).toBe(false);
  expect(readBoardLocation(remaining).users).toEqual([users[0], users[2]]);
});
