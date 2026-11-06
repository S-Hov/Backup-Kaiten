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
export interface CardChanges {
  version: number;
  title?: string;
  description?: string;
  dueDate?: string | null;
  asap?: boolean;
  tagIds?: string[];
  members?: { id: string; role: 1 | 2 }[];
  subscriberIds?: string[];
  typeId?: string | null;
  sizeText?: string | null;
  size?: string | null;
  sizeUnit?: string | null;
  externalId?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  completedAt?: string | null;
  properties?: { id: string; value: z.infer<ReturnType<typeof z.json>> }[];
  checklistItems?: { id: string; text?: string; checked?: boolean }[];
}
const editOption = z.object({ id: z.string(), name: z.string() });
export const cardEditOptionsSchema = z.object({
  tags: z.array(editOption.extend({ color: z.string().nullable() })),
  users: z.array(
    editOption.extend({ avatarUrl: z.string().nullable().optional() }),
  ),
  types: z.array(editOption),
  properties: z.array(
    editOption.extend({ type: z.string(), options: z.array(editOption) }),
  ),
});
export type CardEditOptions = z.infer<typeof cardEditOptionsSchema>;
export const cardApi = {
  editOptions: (boardId: string, signal?: AbortSignal) =>
    apiClient(`/boards/${boardId}/edit-options`, cardEditOptionsSchema, {
      signal,
    }),
  createTag: (boardId: string, body: { name: string; requestId: string }) =>
    apiClient(
      `/boards/${boardId}/tags`,
      editOption.extend({ color: z.string().nullable() }),
      { method: "POST", body },
    ),
  update: (id: string, body: CardChanges) =>
    apiClient(`/cards/${id}/edit`, z.object({ id: z.uuid() }), {
      method: "POST",
      body,
    }),
  move: (
    id: string,
    body: {
      version: number;
      columnId: string;
      laneId: string | null;
      beforeCardId?: string;
      afterCardId?: string;
    },
  ) =>
    apiClient(`/cards/${id}/move`, z.object({ id: z.uuid() }), {
      method: "POST",
      body,
    }),
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
