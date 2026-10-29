import { useSearchParams } from "react-router-dom";
import { useLayoutEffect, useRef } from "react";
import { readBoardLocation, updateBoardParams } from "@/shared/config";
import type { BoardLocation } from "@/shared/config";

export function useBoardNavigation() {
  const [params, setParams] = useSearchParams();
  const latest = useRef(params);
  useLayoutEffect(() => {
    latest.current = params;
  }, [params]);
  const state = readBoardLocation(params);
  function update(patch: Partial<BoardLocation>, replace = false) {
    const next = updateBoardParams(latest.current, patch);
    if (next.toString() !== latest.current.toString()) {
      latest.current = next;
      setParams(next, { replace });
    }
  }
  return {
    ...state,
    update,
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
