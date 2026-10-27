import { useInfiniteQuery } from "@tanstack/react-query";
import { BoardCard, cardQueries } from "@/entities/card";
import styles from "./KanbanBoard.module.scss";

export function CardCell({
  boardId,
  columnId,
  laneId,
  label,
}: {
  boardId: string;
  columnId: string;
  laneId: string | null;
  label: string;
}) {
  const cards = useInfiniteQuery(cardQueries.cell(boardId, columnId, laneId));
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
            <BoardCard key={card.id} card={card} />
          ))}
          {!unique.length && !cards.error && (
            <p className={styles.cellMessage}>Нет карточек</p>
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
