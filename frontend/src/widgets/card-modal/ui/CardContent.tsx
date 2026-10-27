import { useState } from "react";
import { CardTags } from "@/entities/card";
import type { CardDetail } from "@/entities/card";
import { Avatar, Disclosure, Value } from "@/shared/ui";
import { Attachments, ImagePreview } from "@/shared/ui/files";
import { RichText } from "@/shared/ui/rich-text";
import { safeLink } from "@/shared/lib/rich-text";
import { formatDate } from "@/shared/lib/format";
import { CardTimeline } from "./CardTimeline";
import styles from "./CardModal.module.scss";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children || "Не указано"}</dd>
    </div>
  );
}
export function CardContent({
  model,
  onOpen,
}: {
  model: CardDetail;
  onOpen: (id: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const card = model.card;
  const files = model.files
    .filter((file) => !file.deleted)
    .map((file) => ({
      ...file,
      image: /^(image\/(png|jpeg|webp|gif|avif|bmp))$/.test(file.mime || ""),
      video: !!file.mime?.startsWith("video/"),
      audio: !!file.mime?.startsWith("audio/"),
    }));
  return (
    <>
      <div className={styles.columns}>
        <div className={styles.main}>
          <CardTags tags={model.tags} />
          <dl className={styles.fields}>
            <Field label="Тип">{card.type?.name || "Карточка"}</Field>
            <Field label="Дорожка">
              {card.lane?.title || "Основная дорожка"}
            </Field>
            <Field label="Создатель">{card.owner?.name}</Field>
            <Field label="Срок">{formatDate(card.dueDate)}</Field>
            <Field label="Участники">
              <div className={styles.members}>
                {model.members.map((member) => (
                  <span
                    key={`${member.id}:${member.role}`}
                    title={member.email || undefined}
                  >
                    <Avatar label={member.name} />
                    {member.name}
                    {member.role === 2 && <b title="Ответственный">★</b>}
                  </span>
                ))}
                {!model.members.length && "Не назначены"}
              </div>
            </Field>
            <Field label="Размер">
              {card.sizeText ||
                (card.size ? `${card.size} ${card.sizeUnit || ""}` : null)}
            </Field>
            {model.properties.map((property) => (
              <Field key={property.id} label={property.name}>
                <Value value={property.value} />
              </Field>
            ))}
          </dl>
          {model.blockers
            .filter((item) => !item.released)
            .map((item) => (
              <div key={item.id} className={styles.blocked}>
                Заблокирована: {item.reason || "Причина не указана"}
              </div>
            ))}
          <Section title="Описание">
            <RichText
              text={card.description}
              imageMap={model.imageMap}
              onPreview={setPreview}
            />
          </Section>
          {model.checklists.map((checklist) => {
            const items = checklist.items.filter((item) => !item.deleted);
            const done = items.filter((item) => item.checked).length;
            return (
              <Section
                key={checklist.id}
                title={`${checklist.name || "Чек-лист"} · ${done}/${items.length}`}
              >
                <progress
                  max={items.length || 1}
                  value={done}
                  aria-label={`Выполнено ${done} из ${items.length}`}
                />
                {items.map((item) => (
                  <div className={styles.checkItem} key={item.id}>
                    <span
                      className={styles.checkbox}
                      aria-label={item.checked ? "Выполнено" : "Не выполнено"}
                    >
                      {item.checked ? "✓" : ""}
                    </span>
                    <div>
                      <RichText
                        text={item.text}
                        imageMap={model.imageMap}
                        onPreview={setPreview}
                      />
                      {(item.dueDate || item.responsible) && (
                        <small>
                          {item.responsible?.name}{" "}
                          {item.dueDate && formatDate(item.dueDate)}
                        </small>
                      )}
                    </div>
                  </div>
                ))}
              </Section>
            );
          })}
          <Section title={`Файлы · ${files.length}`}>
            <Attachments files={files} onPreview={setPreview} />
          </Section>
          {model.links.length > 0 && (
            <Section title="Ссылки">
              {model.links.map((link) => (
                <p key={link.id}>
                  {safeLink(link.url) ? (
                    <a
                      href={safeLink(link.url)!}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.description || link.url}
                    </a>
                  ) : (
                    link.description || link.url
                  )}
                </p>
              ))}
            </Section>
          )}
          {(
            [
              ["Родительские карточки", model.parents],
              ["Дочерние карточки", model.children],
            ] as const
          ).map(
            ([title, related]) =>
              related.length > 0 && (
                <Section title={title} key={title}>
                  {related.map((item) => (
                    <button
                      className={styles.related}
                      key={item.id}
                      disabled={!item.available}
                      onClick={() => onOpen(item.id)}
                    >
                      #{item.number || "—"} · {item.title || "Без названия"}
                      {item.archived && " · В архиве"}
                      {!item.available && " · Данные не сохранены"}
                    </button>
                  ))}
                </Section>
              ),
          )}
          <Disclosure
            className={styles.details}
            summary="Дополнительные сведения"
          >
            <dl className={styles.fields}>
              {(
                [
                  ["Создана", card.created],
                  ["Обновлена", card.updated],
                  ["Перемещена", card.lastMoved],
                  ["Завершена", card.completedAt],
                  ["Плановое начало", card.plannedStart],
                  ["Плановое окончание", card.plannedEnd],
                ] as const
              ).map(([label, date]) => (
                <Field key={label} label={label}>
                  {formatDate(date)}
                </Field>
              ))}
              <Field label="Подписчики">
                {model.subscribers.map((person) => person.name).join(", ") ||
                  "Нет"}
              </Field>
              <Field label="Внешний ID">{card.externalId}</Field>
              <Field label="Версия">{String(card.version)}</Field>
            </dl>
            {!!model.blockers.length && (
              <Section title="Все блокировки">
                {model.blockers.map((blocker) => (
                  <dl key={blocker.id} className={styles.fields}>
                    <Field label="Причина">{blocker.reason}</Field>
                    <Field label="Состояние">
                      {blocker.released ? "Снята" : "Действует"}
                    </Field>
                    <Field label="Создал">{blocker.createdBy?.name}</Field>
                    <Field label="Срок">{formatDate(blocker.dueDate)}</Field>
                    <Field label="Снял">{blocker.releasedBy?.name}</Field>
                    <Field label="Снята">
                      {formatDate(blocker.releasedAt)}
                    </Field>
                    {blocker.blockingCardId && (
                      <Field label="Связанная блокировка">
                        <button onClick={() => onOpen(blocker.blockingCardId!)}>
                          Открыть блокирующую карточку
                        </button>
                      </Field>
                    )}
                  </dl>
                ))}
              </Section>
            )}
            {Object.entries(model.extras).map(([name, value]) => (
              <Section
                key={name}
                title={
                  (
                    {
                      "time-logs.json": "Учёт времени",
                      "sla.json": "SLA",
                      "iterations.json": "Итерации",
                      "baselines.json": "Базовые планы",
                    } as Record<string, string>
                  )[name] || name
                }
              >
                <Value value={value} />
              </Section>
            ))}
          </Disclosure>
          <Disclosure
            className={styles.details}
            summary="Все сохранённые данные"
          >
            <p>
            Исходные сведения, сохранённые при переносе карточки.
            </p>
            <Value value={model.raw} />
          </Disclosure>
          {model.source.diagnostics.length > 0 && (
            <Disclosure
              className={styles.details}
              summary={`Замечания исходной копии · ${model.source.diagnostics.length}`}
            >
              <ul>
                {model.source.diagnostics.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </Disclosure>
          )}
        </div>
        <CardTimeline model={model} files={files} onPreview={setPreview} />
      </div>
      <ImagePreview
        url={preview}
        files={files}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
