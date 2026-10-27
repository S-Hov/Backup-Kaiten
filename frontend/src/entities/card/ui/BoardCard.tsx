import { useState } from "react";
import type { CardPreview } from "../api/card.schema";
import { tagColor } from "../lib/tag-color";
import styles from "./BoardCard.module.scss";

function Cover({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className={styles.missingCover}>Изображение недоступно</div>
  ) : (
    <img
      className={styles.cover}
      src={url}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function CardTags({ tags }: { tags: CardPreview["tags"] }) {
  return tags.length > 0 ? (
    <ul className={styles.tags} aria-label="Метки">
      {tags.map((tag) => (
        <li key={tag.id} data-color={tagColor(tag.color, tag.id)}>
          {tag.name}
        </li>
      ))}
    </ul>
  ) : null;
}

/** Pure presentation: usable on a board, search results or a related-card list. */
export function BoardCard({
  card,
  onOpen,
}: {
  card: CardPreview;
  onOpen?: (card: CardPreview) => void;
}) {
  const content = (
    <>
      {card.cover && (
        <Cover
          key={card.cover.url}
          url={card.cover.url}
          name={card.cover.name}
        />
      )}
      <div className={styles.body}>
        <CardTags tags={card.tags} />
        <h3 className={styles.title}>{card.title || "Без названия"}</h3>
        <div className={styles.footer}>
          {card.number && <span>#{card.number}</span>}
          {card.asap && <span className={styles.urgent}>Срочно</span>}
        </div>
      </div>
    </>
  );
  return (
    <article
      className={styles.card}
      aria-label={`Карточка ${card.number || ""} ${card.title}`}
    >
      {onOpen ? (
        <button
          className={styles.open}
          onClick={() => onOpen(card)}
          aria-label={`Открыть карточку ${card.number || card.title}`}
        >
          {content}
        </button>
      ) : (
        content
      )}
    </article>
  );
}
