export const routePaths = { board: "/", archive: "/archive" } as const;
export const routeParams = {
  board: "board",
  card: "cardId",
  view: "view",
  archived: "archived",
  search: "q",
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
}
export function readBoardLocation(params: URLSearchParams): BoardLocation {
  return {
    board: params.get(routeParams.board) || "",
    card: params.get(routeParams.card) || "",
    view: params.get(routeParams.view) === "lists" ? "lists" : "board",
    archived: params.get(routeParams.archived) === "1",
    search: params.get(routeParams.search) || "",
  };
}
export function updateBoardParams(
  previous: URLSearchParams,
  patch: Partial<BoardLocation>,
) {
  const params = new URLSearchParams(previous);
  for (const name of Object.keys(patch) as (keyof BoardLocation)[]) {
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
