import { useState } from "react";
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
}: {
  model: CardDetail;
  files: Attachment[];
  onPreview: (url: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("comments");
  const [limit, setLimit] = useState(40);
  return (
    <aside className={styles.timeline} aria-label="Обсуждение и история">
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
        role="tabpanel"
        id={`card-panel-${tab}`}
        aria-labelledby={`card-tab-${tab}`}
      >
        {!model[tab].length && (
          <p className={styles.empty}>В этом разделе пока нет записей</p>
        )}
        {tab === "comments" &&
          model.comments.slice(0, limit).map((comment) => (
            <article key={comment.id} className={styles.comment}>
              <div className={styles.author}>
                <Avatar label={comment.author?.name || "Участник"} />
                <div>
                  <strong>
                    {comment.author?.name || "Неизвестный участник"}
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
                          "commentId" in file && file.commentId === comment.id,
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
        {model[tab].length > limit && (
          <button className={styles.more} onClick={() => setLimit(limit + 40)}>
            Показать ещё
          </button>
        )}
      </div>
    </aside>
  );
}
