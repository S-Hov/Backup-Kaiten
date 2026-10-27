/** Public /api/v1 contract; source-specific raw fields remain unknown JSON. */
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export interface Snapshot {
  id: string;
  boardId: number | null;
  date: string | null;
  cards: number | null;
  files: number | null;
  status: string;
  issues: number;
}
export interface CardListItem {
  id: number;
  title: string;
  archived: boolean;
  columnId?: number | null;
  updated?: string | null;
}
export interface CardPage {
  items: CardListItem[];
  total: number;
  offset: number;
  limit: number;
}
export interface Person {
  id?: number;
  full_name?: string;
  name?: string;
  username?: string;
  email?: string;
  type?: number;
}
export interface Attachment {
  id: string;
  name: string;
  size?: number | null;
  mime?: string;
  image: boolean;
  video?: boolean;
  audio?: boolean;
  status: string;
  url?: string | null;
  downloadUrl?: string | null;
  sha256?: string | null;
  commentId?: number | null;
  cover?: boolean;
  originalUrl?: string | null;
}
export interface CardSummary {
  id: number;
  uid: string | null;
  key: string | null;
  title: string;
  description: string;
  archived: boolean;
  blocked: boolean;
  asap: boolean;
  board: string;
  column: string;
  lane: string;
  type: { name?: string; letter?: string };
  owner: string;
  responsible: string;
  created: string | null;
  updated: string | null;
  dueDate: string | null;
  size: number | string | null;
  state: number | null;
  timeSpent: number | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  completedAt: string | null;
  lastMoved: string | null;
  source: string | null;
  email: string | null;
}
export interface Comment {
  id: number;
  author?: Person;
  text?: string;
  type?: number;
  created?: string;
  edited?: boolean;
  internal?: boolean;
  deleted?: boolean;
}
export interface Checklist {
  id: number;
  name?: string;
  items?: {
    id: number;
    text: string;
    checked?: boolean;
    deleted?: boolean;
    due_date?: string | null;
  }[];
}
export interface LocationEvent {
  id: string | number;
  changed?: string;
  columnName?: string;
  boardName?: string;
  authorName?: string;
  condition?: number;
}
export interface ActivityEvent {
  id: string | number;
  created?: string;
  action: string;
  author?: Person;
  data?: Json;
}
export interface CardViewModel {
  schemaVersion: 1;
  card: CardSummary;
  sections: {
    comments: Comment[];
    members: Person[];
    tags: { id: number; name: string }[];
    properties: { id: string; name: string; value: Json; rawValue: Json }[];
    checklists: Checklist[];
    history: LocationEvent[];
    activity: ActivityEvent[];
    children: { id: number; title?: string }[];
    parents: { id: number; title?: string }[];
    parentIds: number[];
    childIds: number[];
    links: { id?: number; url: string; description?: string }[];
    blockers: Json[];
    timeLogs: Json[];
    iterations: Json[];
    baselines: Json[];
    sla: Json;
  };
  files: Attachment[];
  imageMap: Record<string, string>;
  raw: Record<string, Json>;
  diagnostics: string[];
  sectionStatus: Record<string, string>;
  source: {
    snapshot: string;
    jsonFiles: number;
    availableSections: string[];
    origin: string;
  };
}
