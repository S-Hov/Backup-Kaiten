import { useState, useEffect, useRef } from "react";
import { CommentComposer } from "./CommentComposer";
import { useSession } from "@/entities/session";
import type { CardDetail } from "@/entities/card";
import { Avatar, Disclosure, Value } from "@/shared/ui";
import { RichText } from "@/shared/ui/rich-text";
import { Attachments } from "@/shared/ui/files";
import type { Attachment } from "@/shared/ui/files";
import { formatDate } from "@/shared/lib/format";
import styles from "./CardModal.module.scss";

type Tab = "comments" | "history" | "activity";
const titles = {
  comments: "Комментарии",
  history: "Перемещения",
  activity: "События",
};
const actions: Record<string, string> = {
  card_create: "Создана карточка",
  card_add: "Создана карточка",
  card_move: "Перемещение",
  card_update: "Изменена карточка",
  card_archive: "Отправлена в архив",
  card_file_add: "Прикреплён файл",
  comment_add: "Добавлен комментарий",
};
export function CardTimeline({
  model,
  files,
  onPreview,
  hidden = false,
}: {
  model: CardDetail;
  files: Attachment[];
  onPreview: (url: string) => void;
  hidden?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("comments");
  const account = useSession();
  const [limit, setLimit] = useState(40);
  const entries = useRef<HTMLDivElement>(null);
  const scrollOnSend = useRef(false);
  useEffect(() => {
    if (tab === "comments" && entries.current && !hidden) {
      const el = entries.current;
      if (scrollOnSend.current || el.scrollTop === 0)
        el.scrollTop = el.scrollHeight;
      scrollOnSend.current = false;
    }
  }, [model.comments.length, tab, hidden]);
  return (
    <aside
      hidden={hidden}
      className={styles.timeline}
      aria-label="Обсуждение и история"
    >
      <div className={styles.tabs} role="tablist" aria-label="Разделы истории">
        {(Object.keys(titles) as Tab[]).map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            aria-controls={`card-panel-${name}`}
            id={`card-tab-${name}`}
            onKeyDown={(event) => {
              const names = Object.keys(titles) as Tab[];
              const index = names.indexOf(name);
              const next =
                event.key === "ArrowRight"
                  ? names[(index + 1) % names.length]
                  : event.key === "ArrowLeft"
                    ? names[(index + names.length - 1) % names.length]
                    : event.key === "Home"
                      ? names[0]
                      : event.key === "End"
                        ? names[names.length - 1]
                        : null;
              if (next) {
                event.preventDefault();
                setTab(next);
                setLimit(40);
                document.getElementById(`card-tab-${next}`)?.focus();
              }
            }}
            onClick={() => {
              setTab(name);
              setLimit(40);
            }}
          >
            {titles[name]} <small>{model[name].length}</small>
          </button>
        ))}
      </div>
      <div
        className={styles.entries}
        ref={entries}
        role="tabpanel"
        id={`card-panel-${tab}`}
        aria-labelledby={`card-tab-${tab}`}
      >
        {!model[tab].length && (
          <p className={styles.empty}>В этом разделе пока нет записей</p>
        )}
        {tab === "comments" && model.comments.length > limit && (
          <button className={styles.more} onClick={() => setLimit(limit + 40)}>
            Показать предыдущие сообщения
          </button>
        )}
        {tab === "comments" &&
          model.comments
            .slice(0, limit)
            .reverse()
            .map((comment) => (
              <article
                key={comment.id}
                className={`${styles.comment} ${account && comment.author?.id === account.userId ? styles.ownComment : ""}`}
              >
                <div className={styles.author}>
                  <Avatar
                    label={comment.author?.name || "Участник"}
                    src={comment.author?.avatarUrl}
                  />
                  <div>
                    <strong>
                      {comment.author?.name ||
                        (comment.extra &&
                        typeof comment.extra === "object" &&
                        !Array.isArray(comment.extra) &&
                        comment.extra.local
                          ? "Локальный пользователь"
                          : "Неизвестный участник")}
                    </strong>
                    <small>
                      {formatDate(comment.created)}
                      {comment.edited && " · изменён"}
                      {comment.internal && " · внутренний"}
                    </small>
                  </div>
                </div>
                {comment.deleted ? (
                  <p className={styles.empty}>Комментарий удалён</p>
                ) : (
                  <>
                    <RichText
                      text={comment.text}
                      type={comment.textFormat}
                      imageMap={model.imageMap}
                      onPreview={onPreview}
                    />
                    {files.some(
                      (file) =>
                        "commentId" in file && file.commentId === comment.id,
                    ) && (
                      <Attachments
                        files={files.filter(
                          (file) =>
                            "commentId" in file &&
                            file.commentId === comment.id,
                        )}
                        onPreview={onPreview}
                      />
                    )}
                  </>
                )}
              </article>
            ))}
        {tab === "history" &&
          model.history.slice(0, limit).map((event) => (
            <article className={styles.comment} key={event.id}>
              <strong>{event.column}</strong>
              <p>{event.author?.name || "Неизвестный участник"}</p>
              <small>{formatDate(event.changed)}</small>
            </article>
          ))}
        {tab === "activity" &&
          model.activity.slice(0, limit).map((event) => (
            <article className={styles.comment} key={event.id}>
              <strong>{actions[event.action] || event.action}</strong>
              <p>{event.author?.name || "Неизвестный участник"}</p>
              <small>{formatDate(event.created)}</small>
              <Disclosure summary="Подробности события">
                <Value value={event.data} />
              </Disclosure>
            </article>
          ))}
        {tab !== "comments" && model[tab].length > limit && (
          <button className={styles.more} onClick={() => setLimit(limit + 40)}>
            Показать ещё
          </button>
        )}
      </div>
      {tab === "comments" && (
        <CommentComposer
          cardId={model.card.id}
          disabled={model.card.archived || account?.role === "viewer"}
          disabledReason={
            model.card.archived
              ? "Карточка в архиве"
              : "Доступ только для просмотра"
          }
          onSent={() => {
            scrollOnSend.current = true;
          }}
        />
      )}
    </aside>
  );
}
