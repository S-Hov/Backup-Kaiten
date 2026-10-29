import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { boardQueries, columnTree, leafColumns } from "@/entities/board";
import { cardApi, cardQueries, cardKeys } from "@/entities/card";
import type { CardDetail } from "@/entities/card";
import { Icon } from "@/shared/ui/icon";
import { notify } from "@/shared/ui/notifications";
import styles from "./CardModal.module.scss";

export function CardMove({ card }: { card: CardDetail["card"] }) {
  const boardId = card.board?.id || "";
  const structure = useQuery({
    ...boardQueries.structure(boardId),
    enabled: !!boardId,
  });
  const client = useQueryClient();
  let next: { id: string; title: string } | undefined;
  try {
    const columns = structure.data
      ? leafColumns(columnTree(structure.data.columns))
      : [];
    const index = columns.findIndex((col) => col.id === card.column?.id);
    if (index >= 0) next = columns[index + 1];
  } catch {
    /* Invalid structure is reported by the board. */
  }
  const move = useMutation({
    mutationFn: () => cardApi.moveNext(card.id, card.version),
    retry: false,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: cardQueries.detail(card.id).queryKey,
        }),
        client.invalidateQueries({ queryKey: cardKeys.board(boardId) }),
      ]);
      notify.success("Карточка перемещена");
    },
    onError: () => {
      void client.invalidateQueries({
        queryKey: cardQueries.detail(card.id).queryKey,
      });
    },
  });
  return (
    <div className={styles.moveBar}>
      <button
        className={styles.moveButton}
        disabled={
          !next || card.archived || move.isPending || structure.isFetching
        }
        onClick={() => move.mutate()}
        title={
          card.archived
            ? "Карточка в архиве"
            : next
              ? `Переместить в «${next.title}»`
              : "Следующей колонки нет"
        }
      >
        <Icon name="chevron" size={18} />
        <span>
          {move.isPending
            ? "Перемещаем…"
            : next
              ? `Далее: ${next.title}`
              : structure.isPending
                ? "Загружаем колонки…"
                : "Последняя колонка"}
        </span>
      </button>
    </div>
  );
}
