import { useInfiniteQuery } from "@tanstack/react-query";
import { BoardCard, cardQueries } from "@/entities/card";
import type { CardFilters } from "@/entities/card";
import styles from "./KanbanBoard.module.scss";

export function CardCell({
  boardId,
  columnId,
  laneId,
  label,
  onOpen,
  filters = {},
}: {
  boardId: string;
  columnId: string;
  laneId: string | null;
  label: string;
  onOpen?: (id: string) => void;
  filters?: CardFilters;
}) {
  const cards = useInfiniteQuery(
    cardQueries.cell(boardId, columnId, laneId, filters),
  );
  const items = cards.data?.pages.flatMap((page) => page.items) ?? [];
  // When a page changes after a future live update, never render a duplicate ID.
  const unique = [...new Map(items.map((card) => [card.id, card])).values()];
  return (
    <div
      className={styles.cell}
      aria-label={label}
      aria-busy={cards.isFetching}
    >
      {cards.isPending ? (
        <p className={styles.cellMessage} role="status">
          Загружаем карточки…
        </p>
      ) : (
        <>
          {unique.map((card) => (
            <BoardCard
              key={card.id}
              card={card}
              onOpen={onOpen ? (card) => onOpen(card.id) : undefined}
            />
          ))}
          {!unique.length && !cards.error && (
            <p className={styles.cellMessage}>
              {filters.search ? "Ничего не найдено" : "Нет карточек"}
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
