import { z } from "zod";
import type { Json } from "@/shared/api";

const json: z.ZodType<Json> = z.json();
const id = z.number().int().positive().safe();
const date = z.string().nullable();
const person = z.looseObject({
  id: id.optional(),
  full_name: z.string().optional(),
  name: z.string().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  type: z.number().optional(),
});
export const snapshotSchema = z.looseObject({
  id: z.string(),
  boardId: id.nullable(),
  date,
  cards: z.number().nullable(),
  files: z.number().nullable(),
  status: z.string(),
  issues: z.number(),
});
export const cardListItemSchema = z.looseObject({
  id,
  title: z.string(),
  archived: z.boolean(),
  columnId: id.nullable().optional(),
  updated: date.optional(),
});
export const cardPageSchema = z.looseObject({
  items: z.array(cardListItemSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});
const attachment = z.looseObject({
  id: z.string(),
  name: z.string(),
  size: z.number().nullable().optional(),
  mime: z.string().optional(),
  image: z.boolean(),
  video: z.boolean().optional(),
  audio: z.boolean().optional(),
  status: z.string(),
  url: date.optional(),
  downloadUrl: date.optional(),
  sha256: date.optional(),
  commentId: id.nullable().optional(),
  cover: z.boolean().optional(),
  originalUrl: date.optional(),
});
const summary = z.looseObject({
  id,
  uid: date,
  key: date,
  title: z.string(),
  description: z.string(),
  archived: z.boolean(),
  blocked: z.boolean(),
  asap: z.boolean(),
  board: z.string(),
  column: z.string(),
  lane: z.string(),
  type: z.looseObject({
    name: z.string().optional(),
    letter: z.string().optional(),
  }),
  owner: z.string(),
  responsible: z.string(),
  created: date,
  updated: date,
  dueDate: date,
  size: z.union([z.string(), z.number(), z.null()]),
  state: z.number().nullable(),
  timeSpent: z.number().nullable(),
  plannedStart: date,
  plannedEnd: date,
  completedAt: date,
  lastMoved: date,
  source: date,
  email: date,
});
const comment = z.looseObject({
  id,
  author: person.optional(),
  text: z.string().optional(),
  type: z.number().optional(),
  created: z.string().optional(),
  edited: z.boolean().optional(),
  internal: z.boolean().optional(),
  deleted: z.boolean().optional(),
});
const checklist = z.looseObject({
  id,
  name: z.string().optional(),
  items: z
    .array(
      z.looseObject({
        id,
        text: z.string(),
        checked: z.boolean().optional(),
        deleted: z.boolean().optional(),
        due_date: date.optional(),
      }),
    )
    .optional(),
});
const locationEvent = z.looseObject({
  id: z.union([z.string(), z.number()]),
  changed: z.string().optional(),
  columnName: z.string().optional(),
  boardName: z.string().optional(),
  authorName: z.string().optional(),
  condition: z.number().optional(),
});
const activityEvent = z.looseObject({
  id: z.union([z.string(), z.number()]),
  created: z.string().optional(),
  action: z.string(),
  author: person.optional(),
  data: json.optional(),
});
const related = z.looseObject({ id, title: z.string().optional() });
export const cardViewModelSchema = z.looseObject({
  schemaVersion: z.literal(1),
  card: summary,
  sections: z.looseObject({
    comments: z.array(comment),
    members: z.array(person),
    tags: z.array(z.looseObject({ id, name: z.string() })),
    properties: z.array(
      z.looseObject({
        id: z.string(),
        name: z.string(),
        value: json,
        rawValue: json,
      }),
    ),
    checklists: z.array(checklist),
    history: z.array(locationEvent),
    activity: z.array(activityEvent),
    children: z.array(related),
    parents: z.array(related),
    parentIds: z.array(id),
    childIds: z.array(id),
    links: z.array(
      z.looseObject({
        id: id.optional(),
        url: z.string(),
        description: z.string().nullable().optional(),
      }),
    ),
    blockers: z.array(json),
    timeLogs: z.array(json),
    iterations: z.array(json),
    baselines: z.array(json),
    sla: json,
  }),
  files: z.array(attachment),
  imageMap: z.record(z.string(), z.string()),
  raw: z.record(z.string(), json),
  diagnostics: z.array(z.string()),
  sectionStatus: z.record(z.string(), z.string()),
  source: z.looseObject({
    snapshot: z.string(),
    jsonFiles: z.number(),
    availableSections: z.array(z.string()),
    origin: z.string(),
  }),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type CardListItem = z.infer<typeof cardListItemSchema>;
export type CardPage = z.infer<typeof cardPageSchema>;
export type Person = z.infer<typeof person>;
export type Attachment = z.infer<typeof attachment>;
export type CardSummary = z.infer<typeof summary>;
export type Comment = z.infer<typeof comment>;
export type Checklist = z.infer<typeof checklist>;
export type LocationEvent = z.infer<typeof locationEvent>;
export type ActivityEvent = z.infer<typeof activityEvent>;
export type CardViewModel = z.infer<typeof cardViewModelSchema>;
