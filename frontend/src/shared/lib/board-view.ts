import type { BoardView } from "@/shared/config";

export function readBoardView(): BoardView {
  try {
    return localStorage.getItem("board-view") === "lists" ? "lists" : "board";
  } catch {
    return "board";
  }
}

export function storeBoardView(view: BoardView) {
  try {
    localStorage.setItem("board-view", view);
  } catch {
    /* Keep navigation usable without storage. */
  }
}
