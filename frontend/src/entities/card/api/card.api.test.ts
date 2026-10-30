import { afterEach, expect, it, vi } from "vitest";
import { cardApi } from "./card.api";
afterEach(() => vi.restoreAllMocks());
it("sends user and one-sided date filters without serializing absent bounds", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async () =>
        new Response(JSON.stringify({ items: [], nextCursor: null, total: 0 })),
    );
  await cardApi.cell("board", "column", null, null, {
    users: ["a", "b"],
    dateField: "due",
    dateFrom: "2026-10-30",
  });
  const url = new URL(String(fetch.mock.calls[0][0]), "https://example.test");
  expect(url.searchParams.getAll("user_id")).toEqual(["a", "b"]);
  expect(url.searchParams.get("date_field")).toBe("due");
  expect(url.searchParams.get("date_from")).toBe("2026-10-30");
  expect(url.searchParams.has("date_to")).toBe(false);
  expect(url.searchParams.get("timezone_offset")).toBe(
    String(new Date().getTimezoneOffset()),
  );
});
