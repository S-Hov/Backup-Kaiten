import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { cardApi } from "./card.api";
import type { CardFilters } from "./card.api";

export const cardKeys = {
  board: (boardId: string) => ["working", "board", boardId, "cards"] as const,
};
export const cardQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: ["working", "card", id, "detail"],
      queryFn: ({ signal }) => cardApi.detail(id, signal),
      enabled: !!id,
      meta: { errorTitle: "Не удалось открыть карточку" },
    }),
  cell: (
    boardId: string,
    columnId: string,
    laneId: string | null,
    filters: CardFilters = {},
  ) =>
    infiniteQueryOptions({
      queryKey: [
        ...cardKeys.board(boardId),
        columnId,
        laneId,
        !!filters.archived,
        filters.search || "",
      ],
      initialPageParam: null as string | null,
      queryFn: ({ signal, pageParam }) =>
        cardApi.cell(boardId, columnId, laneId, pageParam, filters, signal),
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      enabled: !!boardId && !!columnId,
      meta: { errorTitle: "Не удалось загрузить карточки" },
    }),
};
