import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { apiClient } from "@/shared/api";
import { cardPageSchema } from "./card.schema";
import { cardDetailSchema } from "./card-detail.schema";

export const cardKeys = {
  board: (boardId: string) => ["working", "board", boardId, "cards"] as const,
};
export const cardQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: ["working", "card", id, "detail"],
      queryFn: ({ signal }) =>
        apiClient(`/cards/${id}/detail`, cardDetailSchema, { signal }),
      enabled: !!id,
      meta: { errorTitle: "Не удалось открыть карточку" },
    }),
  cell: (boardId: string, columnId: string, laneId: string | null) =>
    infiniteQueryOptions({
      queryKey: [...cardKeys.board(boardId), columnId, laneId],
      initialPageParam: null as string | null,
      queryFn: ({ signal, pageParam }) =>
        apiClient(`/boards/${boardId}/cards`, cardPageSchema, {
          signal,
          query: {
            column_id: columnId,
            ...(laneId ? { lane_id: laneId } : {}),
            limit: 30,
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        }),
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      enabled: !!boardId && !!columnId,
      meta: { errorTitle: "Не удалось загрузить карточки" },
    }),
};
