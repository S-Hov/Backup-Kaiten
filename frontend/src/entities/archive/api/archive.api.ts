import { z } from "zod";
import { apiClient } from "@/shared/api";
import {
  snapshotSchema,
  cardPageSchema,
  cardViewModelSchema,
} from "./archive.schema";

export const archiveApi = {
  snapshots: (signal?: AbortSignal) =>
    apiClient("/snapshots", z.array(snapshotSchema), { signal }),
  cards: (
    snapshot: string,
    query: string,
    offset: number,
    signal?: AbortSignal,
  ) =>
    apiClient("/cards", cardPageSchema, {
      query: { snapshot, q: query, offset, limit: 40 },
      signal,
    }),
  card: (snapshot: string, id: number, signal?: AbortSignal) =>
    apiClient(`/cards/${id}`, cardViewModelSchema, {
      query: { snapshot },
      signal,
    }),
};
