export const routePaths = {
  board: "/",
  archive: "/archive",
  login: "/login",
  activate: "/activate",
  users: "/users",
  profile: "/profile",
} as const;
export const pageTitles: Record<string, string> = {
  [routePaths.login]: "Вход · Заказы",
  [routePaths.activate]: "Установка пароля · Заказы",
  [routePaths.users]: "Пользователи · Заказы",
  [routePaths.profile]: "Профиль · Заказы",
};
export const routeParams = {
  board: "board",
  card: "cardId",
  view: "view",
  archived: "archived",
  search: "q",
  tag: "tag",
  tagName: "tagName",
  user: "user",
  userName: "userName",
  userAvatar: "userAvatar",
  dateField: "dateField",
  dateFrom: "dateFrom",
  dateTo: "dateTo",
  legacySnapshot: "snapshot",
  legacyCard: "card",
} as const;
export type BoardView = "board" | "lists";
export interface BoardLocation {
  board: string;
  card: string;
  view: BoardView;
  archived: boolean;
  search: string;
  tags: { id: string; name: string }[];
  users: { id: string; name: string; avatarUrl?: string | null }[];
  dateField: "created" | "updated" | "due";
  dateFrom: string;
  dateTo: string;
}
export function readBoardLocation(params: URLSearchParams): BoardLocation {
  return {
    board: params.get(routeParams.board) || "",
    card: params.get(routeParams.card) || "",
    view: params.get(routeParams.view) === "lists" ? "lists" : "board",
    users: [
      ...new Map(
        params
          .getAll(routeParams.user)
          .filter(Boolean)
          .map((id, index) => [
            id,
            {
              id,
              name: params.getAll(routeParams.userName)[index] || id,
              ...(params.getAll(routeParams.userAvatar)[index]
                ? { avatarUrl: params.getAll(routeParams.userAvatar)[index] }
                : {}),
            },
          ]),
      ).values(),
    ],
    dateField:
      params.get(routeParams.dateField) === "due"
        ? "due"
        : params.get(routeParams.dateField) === "updated"
          ? "updated"
          : "created",
    dateFrom: params.get(routeParams.dateFrom) || "",
    dateTo: params.get(routeParams.dateTo) || "",
    archived: params.get(routeParams.archived) === "1",
    search: params.get(routeParams.search) || "",
    tags: [
      ...new Map(
        params
          .getAll(routeParams.tag)
          .filter(Boolean)
          .map((id, index) => [
            id,
            { id, name: params.getAll(routeParams.tagName)[index] || id },
          ]),
      ).values(),
    ],
  };
}
export function updateBoardParams(
  previous: URLSearchParams,
  patch: Partial<BoardLocation>,
) {
  const params = new URLSearchParams(previous);
  for (const name of Object.keys(patch) as (keyof BoardLocation)[]) {
    if (name === "users") {
      params.delete(routeParams.user);
      params.delete(routeParams.userName);
      params.delete(routeParams.userAvatar);
      for (const user of patch.users || []) {
        params.append(routeParams.user, user.id);
        params.append(routeParams.userName, user.name);
        if (patch.users?.some((item) => item.avatarUrl)) {
          params.append(routeParams.userAvatar, user.avatarUrl || "");
        }
      }
      continue;
    }
    if (name === "tags") {
      params.delete(routeParams.tag);
      params.delete(routeParams.tagName);
      for (const tag of patch.tags || []) {
        params.append(routeParams.tag, tag.id);
        params.append(routeParams.tagName, tag.name);
      }
      continue;
    }
    const value = patch[name];
    const encoded =
      name === "archived"
        ? value
          ? "1"
          : ""
        : name === "view" && value === "board"
          ? ""
          : String(value ?? "");
    if (encoded) params.set(routeParams[name], encoded);
    else params.delete(routeParams[name]);
  }
  return params;
}
export const routeUrls = {
  board: (state: Partial<BoardLocation> = {}) => {
    const query = updateBoardParams(new URLSearchParams(), state).toString();
    return routePaths.board + (query ? `?${query}` : "");
  },
  archive: (search = "") =>
    routePaths.archive + (search ? `?${new URLSearchParams(search)}` : ""),
};
