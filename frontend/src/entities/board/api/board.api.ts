import { z } from "zod";
import { apiClient } from "@/shared/api";
import { boardStructureSchema, boardSummarySchema } from "./board.schema";

export const boardApi = {
  list: (signal?: AbortSignal) =>
    apiClient("/boards", z.array(boardSummarySchema), { signal }),
  structure: (id: string, signal?: AbortSignal) =>
    apiClient(
      `/boards/${encodeURIComponent(id)}/structure`,
      boardStructureSchema,
      { signal },
    ),
};
