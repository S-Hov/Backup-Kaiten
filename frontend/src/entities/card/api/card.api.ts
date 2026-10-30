import { z } from "zod";
import { apiClient } from "@/shared/api";
import { cardDetailSchema } from "./card-detail.schema";
import { cardPageSchema } from "./card.schema";
export interface CardFilters {
  archived?: boolean;
  search?: string;
  tags?: string[];
  users?: string[];
  dateField?: "created" | "updated" | "due";
  dateFrom?: string;
  dateTo?: string;
}
export interface NewCard {
  requestId: string;
  title: string;
  columnId: string;
  laneId: string | null;
}
export const cardApi = {
  moveNext: (id: string, version: number) =>
    apiClient(`/cards/${id}/move-next`, z.object({ id: z.uuid() }), {
      method: "POST",
      body: { version },
    }),
  comment: (
    id: string,
    body: {
      requestId: string;
      text: string;
      files: { name: string; data: string }[];
    },
  ) =>
    apiClient(`/cards/${id}/comments`, z.object({ id: z.uuid() }), {
      method: "POST",
      body,
    }),
  detail: (id: string, signal?: AbortSignal) =>
    apiClient(`/cards/${id}/detail`, cardDetailSchema, { signal }),
  cell: (
    boardId: string,
    columnId: string,
    laneId: string | null,
    cursor: string | null,
    filters: CardFilters = {},
    signal?: AbortSignal,
  ) =>
    apiClient(`/boards/${boardId}/cards`, cardPageSchema, {
      signal,
      query: {
        column_id: columnId,
        ...(laneId ? { lane_id: laneId } : {}),
        limit: 30,
        ...(cursor ? { cursor } : {}),
        ...(filters.archived ? { archived: "true" } : {}),
        ...(filters.search ? { q: filters.search } : {}),
        ...(filters.tags?.length ? { tag_id: filters.tags } : {}),
        ...(filters.users?.length ? { user_id: filters.users } : {}),
        ...(filters.dateFrom || filters.dateTo
          ? {
              date_field: filters.dateField || "created",
              ...(filters.dateFrom ? { date_from: filters.dateFrom } : {}),
              ...(filters.dateTo ? { date_to: filters.dateTo } : {}),
              timezone_offset: new Date().getTimezoneOffset(),
            }
          : {}),
      },
    }),
  create: (boardId: string, body: NewCard) =>
    apiClient(`/boards/${boardId}/cards`, z.object({ id: z.uuid() }), {
      method: "POST",
      body,
    }),
};
