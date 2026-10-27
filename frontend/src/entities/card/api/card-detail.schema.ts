import { z } from "zod";
const json = z.json();
const id = z.uuid();
const date = z.string().nullable();
const person = z.looseObject({
  id,
  name: z.string(),
  email: z.string().nullable(),
});
const location = z.looseObject({ id, title: z.string() }).nullable();
const relation = z.looseObject({
  id,
  number: z.string().nullable(),
  title: z.string(),
  available: z.boolean(),
  archived: z.boolean(),
});
const asset = z
  .string()
  .regex(/^\/api\/v1\/attachments\/[a-f0-9-]+\/content(?:\?download=1)?$/)
  .nullable();
export const cardDetailSchema = z.looseObject({
  schemaVersion: z.literal(1),
  card: z.looseObject({
    id,
    number: z.string().nullable(),
    title: z.string(),
    description: z.string(),
    version: z.number().int(),
    board: location,
    column: location,
    lane: location,
    type: z
      .looseObject({ name: z.string(), letter: z.string().nullable() })
      .nullable(),
    owner: person.nullable(),
    archived: z.boolean(),
    asap: z.boolean(),
    created: date,
    updated: date,
    dueDate: date,
    plannedStart: date,
    plannedEnd: date,
    completedAt: date,
    lastMoved: date,
    size: z.string().nullable(),
    sizeUnit: z.string().nullable(),
    sizeText: z.string().nullable(),
    externalId: z.string().nullable(),
    sourceId: z.string().nullable(),
  }),
  members: z.array(person.extend({ role: z.number() })),
  subscribers: z.array(person),
  tags: z.array(
    z.looseObject({ id, name: z.string(), color: z.string().nullable() }),
  ),
  properties: z.array(
    z.looseObject({
      id,
      name: z.string(),
      type: z.string(),
      value: json,
      rawValue: json,
    }),
  ),
  checklists: z.array(
    z.looseObject({
      id,
      name: z.string(),
      items: z.array(
        z.looseObject({
          id,
          text: z.string(),
          checked: z.boolean(),
          deleted: z.boolean(),
          dueDate: date,
          responsible: person.nullable(),
          checker: person.nullable(),
          checkedAt: date,
        }),
      ),
    }),
  ),
  files: z.array(
    z.looseObject({
      id,
      name: z.string(),
      size: z.number().nullable(),
      mime: z.string().nullable(),
      status: z.string(),
      deleted: z.boolean(),
      cover: z.boolean(),
      commentId: id.nullable(),
      propertyId: id.nullable(),
      url: asset,
      downloadUrl: asset,
      sha256: z.string().nullable(),
      error: z.string().nullable(),
    }),
  ),
  imageMap: z.record(z.string(), z.string()),
  comments: z.array(
    z.looseObject({
      id,
      author: person.nullable(),
      text: z.string(),
      textFormat: z.number(),
      created: date,
      edited: z.boolean(),
      deleted: z.boolean(),
      internal: z.boolean(),
      extra: json,
    }),
  ),
  history: z.array(
    z.looseObject({
      id,
      changed: date,
      column: z.string(),
      author: person.nullable(),
      boardId: id.nullable(),
      laneId: id.nullable(),
      condition: z.number().nullable(),
    }),
  ),
  activity: z.array(
    z.looseObject({
      id,
      created: date,
      action: z.string(),
      author: person.nullable(),
      data: json,
    }),
  ),
  parents: z.array(relation),
  children: z.array(relation),
  links: z.array(
    z.looseObject({ id, url: z.string(), description: z.string().nullable() }),
  ),
  blockers: z.array(
    z.looseObject({
      id,
      reason: z.string(),
      blockingCardId: id.nullable(),
      released: z.boolean(),
      dueDate: date,
      releasedAt: date,
      createdBy: person.nullable(),
      releasedBy: person.nullable(),
    }),
  ),
  extras: z.record(z.string(), json),
  raw: z.record(z.string(), json),
  source: z.looseObject({
    snapshot: z.string().nullable(),
    origin: z.string().nullable(),
    diagnostics: z.array(z.string()),
  }),
});
export type CardDetail = z.infer<typeof cardDetailSchema>;
