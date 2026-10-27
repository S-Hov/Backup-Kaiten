import { useState } from "react";
import type { ReactNode } from "react";
import type { CardViewModel, Json } from "@/entities/archive";
import { Avatar, Disclosure, Value } from "@/shared/ui";
import { RichText } from "@/shared/ui/rich-text";
import { formatDate } from "@/shared/lib/format";
import { fullName } from "@/entities/archive";
import { safeLink } from "@/shared/lib/rich-text";
import { Attachments, ImagePreview } from "@/shared/ui/files";
import { Discussion } from "./Discussion";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="content-section">
      <h2>
        {title}
        {count != null && <small>{count}</small>}
      </h2>
      {children}
    </section>
  );
}
function Extra({ title, value }: { title: string; value: Json }) {
  return (
    <Disclosure className="nested-section" summary={title}>
      <Value value={value} />
    </Disclosure>
  );
}
function Relations({
  title,
  cards,
  ids,
  onOpen,
}: {
  title: string;
  cards: { id: number; title?: string }[];
  ids: number[];
  onOpen: (id: number) => void;
}) {
  const values = new Map(cards.map((card) => [card.id, card]));
  ids.forEach((id) => {
    if (!values.has(id)) values.set(id, { id });
  });
  if (!values.size) return null;
  return (
    <Section title={title} count={values.size}>
      {[...values.values()].map((card) => (
        <button
          className="related-card"
          key={card.id}
          onClick={() => onOpen(card.id)}
        >
          <span>#{card.id}</span>
          {card.title ?? "Открыть карточку"}
          <b>↗</b>
        </button>
      ))}
    </Section>
  );
}
function download(model: CardViewModel) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(model, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `card_${model.card.id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Pure card UI: receives a view model, no fetch calls or storage assumptions. */
export function CardDetails({
  model,
  onOpen,
}: {
  model: CardViewModel;
  onOpen: (id: number) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const c = model.card,
    s = model.sections;
  return (
    <div className="card-detail">
      <div className="detail-breadcrumb">
        {c.board}
        <span>›</span>Карточка #{c.id}
        <span className="copy-date">Снимок архива</span>
      </div>
      <article className="card-shell">
        <header className="card-header">
          <div className="card-badges">
            <span className="card-id">#{c.id}</span>
            {c.key && <span className="badge">{c.key}</span>}
            <span
              className={`badge ${c.archived ? "archive-badge" : "active-badge"}`}
            >
              {c.archived ? "▣ В архиве" : "На доске"}
            </span>
            {c.asap && <span className="badge urgent">Срочно</span>}
            {c.blocked && <span className="badge urgent">Заблокирована</span>}
          </div>
          <h1>{c.title || "Без названия"}</h1>
          <div className="card-subtitle">
            Создал {c.owner}
            <span>·</span>
            {formatDate(c.created)}
          </div>
          <div className="card-toolbar">
            <span className="column-status">
              <i />
              {c.column}
            </span>
            <div className="toolbar-actions">
              <button
                className="icon-button"
                title="Скопировать ссылку"
                aria-label="Скопировать ссылку"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(location.href);
                    setCopyStatus("Ссылка скопирована");
                  } catch {
                    setCopyStatus("Скопируйте адрес из строки браузера");
                  }
                }}
              >
                ↗
              </button>
              <button className="text-button" onClick={() => download(model)}>
                ↓ Скачать данные
              </button>
            </div>
          </div>
          {copyStatus && (
            <p role="status" className="muted">
              {copyStatus}
            </p>
          )}
        </header>
        {model.diagnostics.length > 0 && (
          <details className="diagnostic">
            <summary>
              ⚠ В копии есть замечания · {model.diagnostics.length}
            </summary>
            <ul>
              {[...new Set(model.diagnostics)].map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </details>
        )}
        <div className="card-columns">
          <div className="card-main">
            <dl className="card-fields">
              <Field label="Расположение">
                <span className="location-value">
                  {c.board} / {c.column}
                </span>
                {c.lane && <small className="muted">{c.lane}</small>}
              </Field>
              <Field label="Тип">
                <span className="type-chip">
                  <b>{c.type.letter || c.type.name?.[0] || "К"}</b>
                  {c.type.name || "Карточка"}
                </span>
              </Field>
              <Field label="Участники">
                {s.members.length ? (
                  <div className="member-list">
                    {s.members.map((user, index) => (
                      <span
                        className="member-chip"
                        key={`${user.id}:${index}`}
                        title={user.email}
                      >
                        <Avatar label={fullName(user)} />
                        {fullName(user)}
                        {user.type === 2 && (
                          <span
                            className="responsible-mark"
                            title="Ответственный"
                          >
                            ★
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="muted">Не назначены</span>
                )}
              </Field>
              <Field label="Срок">
                {c.dueDate ? (
                  formatDate(c.dueDate)
                ) : (
                  <span className="muted">Не указан</span>
                )}
              </Field>
              {c.size != null && (
                <Field label="Размер">
                  <Value value={c.size} />
                </Field>
              )}
              <Field label="Метки">
                {s.tags.length ? (
                  s.tags.map((tag) => (
                    <span className="tag" key={tag.id}>
                      {tag.name}
                    </span>
                  ))
                ) : (
                  <span className="muted">Нет меток</span>
                )}
              </Field>
              {s.properties.map((property) => (
                <Field key={property.id} label={property.name}>
                  <Value value={property.value} />
                </Field>
              ))}
            </dl>
            <Section title="≡ Описание">
              <RichText
                text={c.description}
                imageMap={model.imageMap}
                onPreview={setPreview}
              />
            </Section>
            {s.checklists.map((checklist) => {
              const items = (checklist.items ?? []).filter(
                (item) => !item.deleted,
              );
              const done = items.filter((item) => item.checked).length;
              return (
                <Section
                  key={checklist.id}
                  title={`☑ ${checklist.name || "Чек-лист"} · ${done}/${items.length}`}
                >
                  <progress
                    aria-label={`Выполнено пунктов: ${done} из ${items.length}`}
                    max={items.length || 1}
                    value={done}
                  />
                  <div className="check-items">
                    {items.map((item) => (
                      <div
                        className={`check-item ${item.checked ? "checked" : ""}`}
                        key={item.id}
                      >
                        <span
                          className="check-box"
                          aria-label={
                            item.checked ? "Выполнено" : "Не выполнено"
                          }
                        >
                          {item.checked && "✓"}
                        </span>
                        <div>
                          <RichText
                            text={item.text}
                            imageMap={model.imageMap}
                            onPreview={setPreview}
                          />
                          {item.due_date && (
                            <small className="muted">
                              Срок: {formatDate(item.due_date)}
                            </small>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              );
            })}
            <Section title="⌁ Файлы" count={model.files.length}>
              <Attachments
                files={model.files}
                onPreview={setPreview}
                missing={model.sectionStatus.files === "missing"}
              />
            </Section>
            {s.links.length > 0 && (
              <Section title="↗ Ссылки" count={s.links.length}>
                {s.links.map((link, index) => (
                  <div className="external-link" key={link.id ?? index}>
                    {safeLink(link.url) ? (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.description || link.url}
                      </a>
                    ) : (
                      link.description || link.url
                    )}
                  </div>
                ))}
              </Section>
            )}
            <Relations
              title="Родительские карточки"
              cards={s.parents}
              ids={s.parentIds}
              onOpen={onOpen}
            />
            <Relations
              title="Дочерние карточки"
              cards={s.children}
              ids={s.childIds}
              onOpen={onOpen}
            />
            <details className="additional-section">
              <summary>Дополнительные сведения</summary>
              <dl className="card-fields compact-fields">
                {(
                  [
                    ["Обновлена", c.updated],
                    ["Перемещена", c.lastMoved],
                    ["Завершена", c.completedAt],
                    ["Плановое начало", c.plannedStart],
                    ["Плановое окончание", c.plannedEnd],
                  ] as const
                ).map(([label, date]) => (
                  <Field key={label} label={label}>
                    {formatDate(date)}
                  </Field>
                ))}
                <Field label="Затрачено">{c.timeSpent ?? 0} мин</Field>
                <Field label="Источник">{c.source || "Не указан"}</Field>
                <Field label="Почта карточки">{c.email || "Не указана"}</Field>
                <Field label="UID">{c.uid || "Не указан"}</Field>
              </dl>
              <Extra title="Блокировки" value={s.blockers} />
              <Extra title="Учёт времени" value={s.timeLogs} />
              <Extra title="Итерации" value={s.iterations} />
              <Extra title="Базовые планы" value={s.baselines} />
              {s.sla != null && <Extra title="SLA" value={s.sla} />}
            </details>
            <Disclosure
              className="additional-section technical-section"
              summary={
                <>
                  Все поля карточки ·{" "}
                  {Object.keys(model.raw["card.json"] ?? {}).length}
                </>
              }
            >
              <dl className="all-fields">
                {Object.entries(model.raw["card.json"] ?? {}).map(
                  ([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>
                        <Value value={value} />
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            </Disclosure>
          </div>
          <Discussion model={model} onPreview={setPreview} />
        </div>
        <footer className="card-footer">
          <span>▣ {model.source.jsonFiles} JSON-файлов прочитано</span>
          <span>Карточка #{c.id}</span>
        </footer>
      </article>
      <ImagePreview
        url={preview}
        files={model.files}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
