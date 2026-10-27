import type { CardPage, CardViewModel, Snapshot } from "./types";

async function get<T>(
  path: string,
  params: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<T> {
  const query = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  );
  const response = await fetch(`/api/v1${path}?${query}`, { signal });
  if (!response.ok) {
    let message = `Ошибка сервера (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.error === "string") message = body.error;
    } catch {
      /* Keep HTTP status for non-JSON failures. */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  snapshots: (signal?: AbortSignal) =>
    get<Snapshot[]>("/snapshots", {}, signal),
  cards: (
    snapshot: string,
    query: string,
    offset: number,
    signal?: AbortSignal,
  ) =>
    get<CardPage>("/cards", { snapshot, q: query, offset, limit: 40 }, signal),
  card: (snapshot: string, id: number, signal?: AbortSignal) =>
    get<CardViewModel>(`/cards/${id}`, { snapshot }, signal),
};
