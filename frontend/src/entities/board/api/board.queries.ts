import { queryOptions } from "@tanstack/react-query";
import { boardApi } from "./board.api";

export const boardQueries = {
  filterOptions: (id: string) =>
    queryOptions({
      queryKey: ["working", "board", id, "filter-options"],
      queryFn: ({ signal }) => boardApi.filterOptions(id, signal),
      enabled: !!id,
    }),
  list: () =>
    queryOptions({
      queryKey: ["working", "boards"],
      queryFn: ({ signal }) => boardApi.list(signal),
    }),
  structure: (id: string) =>
    queryOptions({
      queryKey: ["working", "board", id, "structure"],
      queryFn: ({ signal }) => boardApi.structure(id, signal),
      enabled: !!id,
    }),
};
