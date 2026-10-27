import { useState } from "react";
import type { CardViewModel } from "@/entities/archive";
import { Avatar, Empty, Value } from "@/shared/ui";
import { RichText } from "@/shared/ui/rich-text";
import { formatDate } from "@/shared/lib/format";
import { fullName } from "@/entities/archive";
import { Attachments } from "@/shared/ui/files";

const tabs = {
  comments: "Комментарии",
  history: "История",
  activity: "События",
  raw: "JSON",
} as const;
type Tab = keyof typeof tabs;
const actions: Record<string, string> = {
  card_add: "Создал карточку",
  card_create: "Создал карточку",
  card_update: "Изменил карточку",
  card_move: "Переместил карточку",
  card_archive: "Отправил в архив",
  card_revive: "Вернул из архива",
  card_delete: "Удалил карточку",
  card_file_add: "Прикрепил файл",
  card_file_remove: "Удалил вложение",
  comment_add: "Добавил комментарий",
  comment_update: "Изменил комментарий",
  comment_delete: "Удалил комментарий",
  card_assign_member: "Добавил участника",
  card_unassign_member: "Убрал участника",
  card_assign_responsible: "Назначил ответственного",
  card_tag_add: "Добавил метку",
  card_tag_remove: "Убрал метку",
  card_block: "Заблокировал карточку",
  card_unblock: "Снял блокировку",
  card_checklist_add: "Добавил чек-лист",
  card_description_update: "Изменил описание",
  card_change_title: "Изменил название",
  card_change_due_date: "Изменил срок",
};

export function Discussion({
  model,
  onPreview,
}: {
  model: CardViewModel;
  onPreview: (url: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("comments");
  const [limit, setLimit] = useState(40);
  const [rawFile, setRawFile] = useState(Object.keys(model.raw)[0]);
  const entries = tab === "raw" ? [] : model.sections[tab];
  const missing = model.sectionStatus[tab] === "missing";
  const sortDate = (entry: unknown) => {
    const value = entry as { created?: string; changed?: string };
    return value.created ?? value.changed ?? "";
  };
  const sorted = [...entries].sort((a, b) =>
    sortDate(b).localeCompare(sortDate(a)),
  );
  return (
    <aside className="card-discussion">
      <nav className="discussion-tabs" aria-label="Разделы карточки">
        {(Object.keys(tabs) as Tab[]).map((name) => (
          <button
            key={name}
            className={name === tab ? "active" : ""}
            aria-pressed={tab === name}
            onClick={() => {
              setTab(name);
              setLimit(40);
            }}
          >
            {tabs[name]}{" "}
            {name !== "raw" && <small>{model.sections[name].length}</small>}
          </button>
        ))}
      </nav>
      <div className="discussion-content">
        {missing ? (
          <Empty>Этот раздел не был сохранён в резервной копии</Empty>
        ) : tab === "raw" ? (
          <>
            <label className="small-label" htmlFor="raw-files">
              Исходные данные
            </label>
            <select
              id="raw-files"
              value={rawFile}
              onChange={(event) => setRawFile(event.target.value)}
            >
              {Object.keys(model.raw).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <pre className="raw-data">
              {JSON.stringify(model.raw[rawFile], null, 2)}
            </pre>
          </>
        ) : !entries.length ? (
          <Empty>
            {tab === "comments"
              ? "В этой карточке нет комментариев"
              : "Записей нет"}
          </Empty>
        ) : (
          <>
            {tab === "comments" &&
              [...model.sections.comments]
                .sort((a, b) => sortDate(b).localeCompare(sortDate(a)))
                .slice(0, limit)
                .map((comment) => (
                  <article className="comment" key={comment.id}>
                    <div className="comment-heading">
                      <Avatar label={fullName(comment.author)} />
                      <div>
                        <b>{fullName(comment.author)}</b>
                        <time>
                          {formatDate(comment.created)}
                          {comment.edited && " · изменён"}
                          {comment.internal && " · внутренний"}
                        </time>
                      </div>
                    </div>
                    {comment.deleted ? (
                      <p className="muted">Комментарий удалён</p>
                    ) : (
                      <div className="comment-text">
                        <RichText
                          text={comment.text}
                          imageMap={model.imageMap}
                          type={comment.type}
                          onPreview={onPreview}
                        />
                      </div>
                    )}
                    {model.files.some(
                      (file) => file.commentId === comment.id,
                    ) && (
                      <Attachments
                        files={model.files.filter(
                          (file) => file.commentId === comment.id,
                        )}
                        onPreview={onPreview}
                      />
                    )}
                  </article>
                ))}
            {tab === "history" &&
              [...model.sections.history]
                .sort((a, b) => sortDate(b).localeCompare(sortDate(a)))
                .slice(0, limit)
                .map((event) => (
                  <article className="timeline-item" key={event.id}>
                    <span className="timeline-dot" />
                    <time>{formatDate(event.changed)}</time>
                    <b>{event.columnName}</b>
                    <p>{event.authorName}</p>
                    <small>
                      {event.boardName}
                      {event.condition === 2 && " · в архиве"}
                    </small>
                  </article>
                ))}
            {tab === "activity" &&
              [...model.sections.activity]
                .sort((a, b) => sortDate(b).localeCompare(sortDate(a)))
                .slice(0, limit)
                .map((event) => (
                  <article className="timeline-item" key={event.id}>
                    <span className="timeline-dot" />
                    <time>{formatDate(event.created)}</time>
                    <b>{actions[event.action] ?? "Изменение карточки"}</b>
                    <p>{fullName(event.author)}</p>
                    <details className="event-details">
                      <summary>Подробности</summary>
                      <small>{event.action}</small>
                      <Value value={event.data} />
                    </details>
                  </article>
                ))}
            {sorted.length > limit && (
              <button
                className="load-more"
                onClick={() => setLimit(limit + 40)}
              >
                Показать ещё {Math.min(40, sorted.length - limit)}
              </button>
            )}
          </>
        )}
      </div>
      <div className="discussion-footer">Сохранённые данные · время МСК</div>
    </aside>
  );
}
