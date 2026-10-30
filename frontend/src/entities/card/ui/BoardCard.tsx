import { useState } from "react";
import { Avatar } from "@/shared/ui";
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

export function CardTags({
  tags,
  onSelect,
  selectedIds = [],
}: {
  tags: CardPreview["tags"];
  onSelect?: (tag: CardPreview["tags"][number]) => void;
  selectedIds?: string[];
}) {
  return tags.length > 0 ? (
    <ul className={styles.tags} aria-label="Метки">
      {tags.map((tag) => (
        <li key={tag.id} data-color={tagColor(tag.color, tag.id)}>
          {onSelect ? (
            <button
              className={styles.tagButton}
              onClick={() => onSelect(tag)}
              aria-pressed={selectedIds.includes(tag.id)}
              aria-label={`Фильтровать по метке «${tag.name}»`}
            >
              {tag.name}
            </button>
          ) : (
            tag.name
          )}
        </li>
      ))}
    </ul>
  ) : null;
}

/** Pure presentation: usable on a board, search results or a related-card list. */
export function BoardCard({
  card,
  onOpen,
  onSelectTag,
  selectedTagIds,
  onSelectUser,
  selectedUserIds = [],
}: {
  card: CardPreview;
  onOpen?: (card: CardPreview) => void;
  onSelectTag?: (tag: CardPreview["tags"][number]) => void;
  selectedTagIds?: string[];
  onSelectUser?: (user: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  }) => void;
  selectedUserIds?: string[];
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
        <CardTags
          tags={card.tags}
          onSelect={onSelectTag}
          selectedIds={selectedTagIds}
        />
        <h3 className={styles.title}>{card.title || "Без названия"}</h3>
        <div className={styles.footer}>
          {card.number && <span>#{card.number}</span>}
          {card.asap && <span className={styles.urgent}>Срочно</span>}
          {!!card.members?.length && (
            <div className={styles.members} aria-label="Участники">
              {card.members.slice(0, 5).map((member) =>
                onSelectUser ? (
                  <button
                    key={member.id}
                    className={styles.memberButton}
                    onClick={() => onSelectUser(member)}
                    aria-label={`Фильтровать по пользователю «${member.name}»`}
                    aria-pressed={selectedUserIds.includes(member.id)}
                  >
                    <Avatar label={member.name} src={member.avatarUrl} />
                  </button>
                ) : (
                  <Avatar
                    key={member.id}
                    label={member.name}
                    src={member.avatarUrl}
                  />
                ),
              )}
              {card.members.length > 5 && (
                <span>+{card.members.length - 5}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
  return (
    <article
      className={styles.card}
      aria-label={`Карточка ${card.number || ""} ${card.title}`}
    >
      {content}
      {onOpen && (
        <button
          className={styles.open}
          onClick={() => onOpen(card)}
          aria-label={`Открыть карточку ${card.number || card.title}`}
        ></button>
      )}
    </article>
  );
}
