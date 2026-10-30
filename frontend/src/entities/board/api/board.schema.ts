import { z } from "zod";

export const boardSummarySchema = z.looseObject({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  sourceId: z.string().nullable(),
});
export const boardColumnSchema = z.looseObject({
  id: z.uuid(),
  title: z.string(),
  parentId: z.uuid().nullable(),
  sortOrder: z.string(),
  type: z.number().int().nullable(),
  wipLimit: z.number().int().nullable(),
});
export const boardLaneSchema = z.looseObject({
  id: z.uuid(),
  title: z.string(),
  sortOrder: z.string(),
});
export const boardStructureSchema = z.looseObject({
  board: boardSummarySchema,
  columns: z.array(boardColumnSchema),
  lanes: z.array(boardLaneSchema),
});
export type BoardSummary = z.infer<typeof boardSummarySchema>;
export type BoardColumn = z.infer<typeof boardColumnSchema>;
export type BoardLane = z.infer<typeof boardLaneSchema>;
export type BoardStructure = z.infer<typeof boardStructureSchema>;

export const boardFilterOptionsSchema = z.object({
  tags: z.array(
    z.object({ id: z.uuid(), name: z.string(), color: z.string().nullable() }),
  ),
  users: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      avatarUrl: z.string().nullable().optional(),
    }),
  ),
});
export type BoardFilterOptions = z.infer<typeof boardFilterOptionsSchema>;
