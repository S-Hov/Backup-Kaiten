import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { cardQueries } from "@/entities/card";
import { Modal } from "@/shared/ui/modal";
import { notify } from "@/shared/ui/notifications";
import { CardContent } from "./CardContent";
import styles from "./CardModal.module.scss";

export function CardModal({
  cardId,
  onClose,
  onOpen,
}: {
  cardId: string;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const detail = useQuery(cardQueries.detail(cardId));
  const card = detail.data?.card;
  useEffect(() => {
    if (!card) return;
    const previous = document.title;
    document.title = `${card.number ? `#${card.number} · ` : ""}${card.title || "Карточка"}`;
    return () => {
      document.title = previous;
    };
  }, [card]);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify.success("Ссылка на карточку скопирована");
    } catch {
      notify.error("Не удалось скопировать ссылку");
    }
  }
  return (
    <Modal labelledBy="working-card-title" onClose={onClose}>
      <div className={styles.layout}>
        <header className={styles.header}>
          <div className={styles.breadcrumb}>
            {card?.board?.title || "Доска"}
            <span>›</span>
            {card?.column?.title || "Карточка"}
          </div>
          <div className={styles.meta}>
            {card?.number && (
              <span className={styles.number}>#{card.number}</span>
            )}
            {card && (
              <span className={styles.badge}>
                {card.archived ? "В архиве" : "На доске"}
              </span>
            )}
            {card?.asap && <span className={styles.urgent}>Срочно</span>}
            {card && (
              <button className={styles.copyLink} onClick={copyLink}>
                Скопировать ссылку
              </button>
            )}
          </div>
          <h1 id="working-card-title">
            {card
              ? card.title || "Без названия"
              : detail.isError
                ? "Не удалось открыть карточку"
                : "Загрузка карточки…"}
          </h1>
        </header>
        {detail.isPending ? (
          <p className={styles.state} role="status">
            Загружаем данные карточки…
          </p>
        ) : detail.isError ? (
          <div className={styles.state} role="alert">
            <p>{detail.error.message}</p>
            <button onClick={() => void detail.refetch()}>
              Повторить запрос
            </button>
          </div>
        ) : (
          <CardContent
            key={detail.data.card.id}
            model={detail.data}
            onOpen={onOpen}
          />
        )}
      </div>
    </Modal>
  );
}
