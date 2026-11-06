import { useEffect, type DragEvent } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { BoardCard, cardQueries } from "@/entities/card";
import type { CardFilters } from "@/entities/card";
import styles from "./KanbanBoard.module.scss";
import { useCardDrag, type DropPosition } from "./CardDragContext";

export function CardCell({
  boardId,
  columnId,
  laneId,
  label,
  onOpen,
  onSelectTag,
  onSelectUser,
  onCount,
  filters = {},
}: {
  boardId: string;
  columnId: string;
  laneId: string | null;
  label: string;
  onOpen?: (id: string) => void;
  onSelectTag?: (tag: { id: string; name: string }) => void;
  filters?: CardFilters;
  onSelectUser?: (user: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  }) => void;
  onCount?: (
    columnId: string,
    laneId: string | null,
    total: number | undefined,
  ) => void;
}) {
  const cards = useInfiniteQuery(
    cardQueries.cell(boardId, columnId, laneId, filters),
  );
  const total = cards.data?.pages[0]?.total;
  useEffect(() => {
    onCount?.(columnId, laneId, total);
  }, [onCount, columnId, laneId, total]);
  const items = cards.data?.pages.flatMap((page) => page.items) ?? [];
  // When a page changes after a future live update, never render a duplicate ID.
  const unique = [...new Map(items.map((card) => [card.id, card])).values()];
  const drag = useCardDrag();
  const active =
    drag?.target?.columnId === columnId && drag.target.laneId === laneId;
  const available =
    !!drag?.card && !drag.busy && !cards.isPending && !cards.error;
  function position(event: DragEvent<HTMLDivElement>): DropPosition {
    const elements = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[data-card-id]"),
    ).filter((element) => element.dataset.cardId !== drag?.card?.id);
    const before = elements.find((element) => {
      const rect = element.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    return {
      columnId,
      laneId,
      label,
      ...(before
        ? { beforeCardId: before.dataset.cardId }
        : elements.length
          ? { afterCardId: elements[elements.length - 1].dataset.cardId }
          : {}),
    };
  }
  const marker = (
    <div className={styles.dropMarker} aria-hidden="true">
      <span>{drag?.busy ? "Сохраняем…" : "Вставить сюда"}</span>
    </div>
  );
  const atEnd = active && !drag?.target?.beforeCardId;
  return (
    <div
      className={`${styles.cell} ${active ? styles.dropCell : ""}`}
      aria-label={label}
      aria-busy={cards.isFetching}
      onDragOver={(event) => {
        if (!available) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        drag!.hover(position(event));
      }}
      onDragLeave={(event) => {
        if (
          active &&
          !drag?.busy &&
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        )
          drag?.hover(null);
      }}
      onDrop={(event) => {
        if (!available) return;
        event.preventDefault();
        const target = position(event);
        const sourceIndex = unique.findIndex(
          (card) => card.id === drag!.card!.id,
        );
        const sameCell =
          drag!.card!.columnId === columnId && drag!.card!.laneId === laneId;
        if (
          sameCell &&
          (target.beforeCardId === unique[sourceIndex + 1]?.id ||
            (target.afterCardId === unique[sourceIndex - 1]?.id &&
              sourceIndex === unique.length - 1) ||
            unique.length === 1)
        ) {
          drag!.cancel();
          return;
        }
        drag!.drop(target);
      }}
    >
      {cards.isPending ? (
        <p className={styles.cellMessage} role="status">
          Загружаем карточки…
        </p>
      ) : (
        <>
          {unique.map((card) => (
            <div
              key={card.id}
              data-card-id={card.id}
              className={`${styles.draggableCard} ${drag?.card?.id === card.id ? styles.draggingCard : ""}`}
              draggable={!!drag?.enabled}
              onDragStart={(event) => {
                if (!drag?.enabled) {
                  event.preventDefault();
                  return;
                }
                drag.start(card);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", card.id);
              }}
              onDragEnd={() => drag?.cancel()}
            >
              {active && drag?.target?.beforeCardId === card.id && marker}
              <BoardCard
                key={card.id}
                card={card}
                onSelectTag={onSelectTag}
                onSelectUser={onSelectUser}
                selectedUserIds={filters.users}
                selectedTagIds={filters.tags}
                onOpen={onOpen ? (card) => onOpen(card.id) : undefined}
              />
            </div>
          ))}
          {atEnd && marker}
          {!unique.length && !cards.error && (
            <p className={styles.cellMessage}>
              {filters.search ||
              filters.tags?.length ||
              filters.users?.length ||
              filters.dateFrom ||
              filters.dateTo
                ? "Ничего не найдено"
                : "Нет карточек"}
            </p>
          )}
          {cards.error && (
            <div className={styles.cellError} role="alert">
              <p>{cards.error.message}</p>
              <button
                onClick={() =>
                  cards.isFetchNextPageError
                    ? void cards.fetchNextPage()
                    : void cards.refetch()
                }
              >
                Повторить
              </button>
            </div>
          )}
          {cards.hasNextPage && !cards.isFetchNextPageError && (
            <button
              className={styles.loadMore}
              disabled={cards.isFetching}
              onClick={() => void cards.fetchNextPage()}
            >
              {cards.isFetchingNextPage ? "Загружаем…" : "Показать ещё"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
