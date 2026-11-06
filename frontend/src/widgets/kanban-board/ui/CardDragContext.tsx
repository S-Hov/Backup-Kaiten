import { createContext, useContext, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  cardApi,
  cardKeys,
  cardQueries,
  type CardPreview,
} from "@/entities/card";
import { useSession } from "@/entities/session";
import styles from "./KanbanBoard.module.scss";

export type DropPosition = {
  columnId: string;
  laneId: string | null;
  beforeCardId?: string;
  afterCardId?: string;
  label: string;
};
type DragState = {
  card: CardPreview | null;
  target: DropPosition | null;
  busy: boolean;
  enabled: boolean;
  start: (card: CardPreview) => void;
  hover: (target: DropPosition | null) => void;
  cancel: () => void;
  drop: (target: DropPosition) => void;
};
const Context = createContext<DragState | null>(null);
export const useCardDrag = () => useContext(Context);

export function CardDragProvider({
  boardId,
  archived,
  children,
}: {
  boardId: string;
  archived?: boolean;
  children: ReactNode;
}) {
  const account = useSession();
  const client = useQueryClient();
  const [card, setCard] = useState<CardPreview | null>(null);
  const [target, setTarget] = useState<DropPosition | null>(null);
  const move = useMutation({
    mutationFn: ({
      card,
      target,
    }: {
      card: CardPreview;
      target: DropPosition;
    }) =>
      cardApi.move(card.id, {
        version: card.version,
        columnId: target.columnId,
        laneId: target.laneId,
        beforeCardId: target.beforeCardId,
        afterCardId: target.afterCardId,
      }),
    retry: false,
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: cardKeys.board(boardId) }),
        client.invalidateQueries({
          queryKey: cardQueries.detail(variables.card.id).queryKey,
        }),
      ]);
      setCard(null);
      setTarget(null);
    },
    meta: { errorTitle: "Не удалось переместить карточку" },
  });
  return (
    <Context.Provider
      value={{
        card,
        target,
        busy: move.isPending,
        enabled: !archived && account?.role !== "viewer" && !move.isPending,
        start: (value) => {
          setCard(value);
          setTarget(null);
        },
        hover: setTarget,
        cancel: () => {
          if (!move.isPending) {
            setCard(null);
            setTarget(null);
          }
        },
        drop: (position) => {
          if (card && !move.isPending) {
            setTarget(position);
            move.mutate({ card, target: position });
          }
        },
      }}
    >
      {children}
      <div className={styles.dragStatus} role="status" aria-live="polite">
        {move.isPending
          ? "Сохраняем положение карточки…"
          : card && target
            ? `Место вставки: ${target.label}`
            : ""}
      </div>
    </Context.Provider>
  );
}
