import { z } from "zod";

export const cardPreviewSchema = z.looseObject({
  id: z.uuid(),
  number: z.string().nullable(),
  title: z.string(),
  columnId: z.uuid().nullable(),
  laneId: z.uuid().nullable(),
  sortOrder: z.string(),
  version: z.number().int().positive(),
  asap: z.boolean(),
  members: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        avatarUrl: z.string().nullable().optional(),
      }),
    )
    .optional(),
  tags: z.array(
    z.looseObject({
      id: z.uuid(),
      name: z.string(),
      color: z.string().nullable(),
    }),
  ),
  cover: z
    .looseObject({
      id: z.uuid(),
      name: z.string(),
      explicit: z.boolean(),
      url: z.string().regex(/^\/api\/v1\/attachments\/[a-f0-9-]+\/image$/),
    })
    .nullable(),
});
export const cardPageSchema = z.looseObject({
  items: z.array(cardPreviewSchema),
  nextCursor: z.string().nullable(),
});
export type CardPreview = z.infer<typeof cardPreviewSchema>;
