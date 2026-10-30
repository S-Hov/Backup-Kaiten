import { useSearchParams } from "react-router-dom";
import { useLayoutEffect, useRef } from "react";
import { readBoardLocation, updateBoardParams } from "@/shared/config";
import type { BoardLocation } from "@/shared/config";
import { readBoardView, storeBoardView } from "@/shared/lib/board-view";

export function useBoardNavigation() {
  const [params, setParams] = useSearchParams();
  const latest = useRef(params);
  useLayoutEffect(() => {
    latest.current = params;
  }, [params]);
  const state = readBoardLocation(params);
  if (!params.has("view")) {
    state.view = readBoardView();
  }
  useLayoutEffect(() => {
    if (!params.has("view")) {
      const next = new URLSearchParams(params);
      next.set("view", state.view);
      latest.current = next;
      setParams(next, { replace: true });
    }
    storeBoardView(state.view);
  }, [params, setParams, state.view]);
  function update(patch: Partial<BoardLocation>, replace = false) {
    const next = updateBoardParams(latest.current, patch);
    if (patch.view) next.set("view", patch.view);
    if (next.toString() !== latest.current.toString()) {
      latest.current = next;
      setParams(next, { replace });
    }
  }
  return {
    ...state,
    update,
    toggleTag: (tag: { id: string; name: string }) => {
      const tags = readBoardLocation(latest.current).tags;
      update({
        tags: tags.some((item) => item.id === tag.id)
          ? tags.filter((item) => item.id !== tag.id)
          : [...tags, tag],
      });
    },
    toggleUser: (user: {
      id: string;
      name: string;
      avatarUrl?: string | null;
    }) => {
      const users = readBoardLocation(latest.current).users;
      update({
        users: users.some((item) => item.id === user.id)
          ? users.filter((item) => item.id !== user.id)
          : [...users, user],
      });
    },
    openCard: (card: string) => update({ card }),
    closeCard: () => update({ card: "" }, true),
    selectBoard: (board: string) => update({ board, card: "" }),
    toggleArchive: () =>
      update({
        archived: !readBoardLocation(latest.current).archived,
        card: "",
      }),
  };
}
