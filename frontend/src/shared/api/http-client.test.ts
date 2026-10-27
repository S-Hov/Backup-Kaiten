import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiClient, ApiContractError, ApiError } from "./http-client";

afterEach(() => vi.unstubAllGlobals());
const schema = z.looseObject({ title: z.string() });
function respond(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
  );
}
describe("HTTP boundary", () => {
  it("validates the response, keeps extra fields and forwards cancellation", async () => {
    respond({ title: "Доска", future: true });
    const signal = new AbortController().signal;
    expect(
      await apiClient("/boards", schema, { query: { q: "А & Б" }, signal }),
    ).toEqual({ title: "Доска", future: true });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/boards?q=%D0%90+%26+%D0%91",
      expect.objectContaining({ signal, credentials: "same-origin" }),
    );
  });
  it("distinguishes a contract violation from an HTTP failure", async () => {
    respond({ title: 1 });
    await expect(apiClient("/boards", schema)).rejects.toBeInstanceOf(
      ApiContractError,
    );
    respond({ error: "Доска не найдена" }, 404);
    await expect(apiClient("/boards", schema)).rejects.toMatchObject({
      status: 404,
      message: "Доска не найдена",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502 })),
    );
    await expect(apiClient("/boards", schema)).rejects.toBeInstanceOf(ApiError);
  });
  it("does not convert an aborted fetch into a network error", async () => {
    const error = new DOMException("Aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    await expect(apiClient("/boards", schema)).rejects.toBe(error);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockRejectedValue(error),
        }),
    );
    await expect(apiClient("/boards", schema)).rejects.toBe(error);
  });
});
