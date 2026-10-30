import { z } from "zod";
import { apiClient } from "@/shared/api";
import {
  boardStructureSchema,
  boardSummarySchema,
  boardFilterOptionsSchema,
} from "./board.schema";

export const boardApi = {
  filterOptions: (id: string, signal?: AbortSignal) =>
    apiClient(
      `/boards/${encodeURIComponent(id)}/filter-options`,
      boardFilterOptionsSchema,
      { signal },
    ),
  list: (signal?: AbortSignal) =>
    apiClient("/boards", z.array(boardSummarySchema), { signal }),
  structure: (id: string, signal?: AbortSignal) =>
    apiClient(
      `/boards/${encodeURIComponent(id)}/structure`,
      boardStructureSchema,
      { signal },
    ),
};
