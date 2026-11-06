import { Icon } from "@/shared/ui/icon";
import { useState } from "react";
import type { CardDetail } from "@/entities/card";
import { Disclosure, Value } from "@/shared/ui";
import { Attachments, ImagePreview } from "@/shared/ui/files";
import { RichText } from "@/shared/ui/rich-text";
import { safeLink } from "@/shared/lib/rich-text";
import { formatDate } from "@/shared/lib/format";
import { CardTimeline } from "./CardTimeline";
import { CardMove } from "./CardMove";
import { InlineField, inputDate, savedDate } from "./InlineField";
import { InlineSelection } from "./InlineSelection";
import {
  CatalogField,
  LocationField,
  CardPropertyFields,
} from "./CardEditableFields";
import { useCardEditing } from "./CardEditing";
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
  panelHidden = false,
}: {
  model: CardDetail;
  onOpen: (id: string) => void;
  panelHidden?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const card = model.card;
  const editing = useCardEditing();
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
      <div
        className={`${styles.columns} ${panelHidden ? styles.panelHidden : ""}`}
      >
        <div className={styles.main}>
          <CardMove card={card} disabled={!!editing.active} />
          <InlineSelection kind="tags" label="Теги" selected={model.tags} />
          <dl className={styles.fields}>
            <Field label="Тип">
              <CatalogField id="type" label="Тип" value={card.type?.id || ""}>
                {card.type?.name || "Карточка"}
              </CatalogField>
            </Field>
            <Field label="Колонка">
              <LocationField field="column" />
            </Field>
            <Field label="Дорожка">
              <LocationField field="lane" />
            </Field>
            <Field label="Создатель">{card.owner?.name}</Field>
            <Field label="Срок">
              <InlineField
                id="dueDate"
                label="Срок"
                kind="date"
                value={inputDate(card.dueDate)}
                toChanges={(value) => ({ dueDate: savedDate(value) })}
              >
                {card.dueDate ? formatDate(card.dueDate) : "Указать срок"}
              </InlineField>
            </Field>
            <Field label="Приоритет">
              <InlineField
                id="asap"
                label="Приоритет"
                kind="select"
                value={String(card.asap)}
                options={[
                  { id: "false", name: "Обычный" },
                  { id: "true", name: "Срочно" },
                ]}
                toChanges={(value) => ({ asap: value === "true" })}
              >
                {card.asap ? "Срочно" : "Обычный"}
              </InlineField>
            </Field>
            <Field label="Участники">
              <InlineSelection
                kind="members"
                label="Участники"
                selected={model.members}
              />
            </Field>
            <Field label="Размер">
              <InlineField
                id="sizeText"
                label="Размер"
                value={
                  card.sizeText ||
                  (card.size
                    ? `${card.size} ${card.sizeUnit || ""}`.trim()
                    : "")
                }
                toChanges={(value) => ({
                  sizeText: value || null,
                  size: null,
                  sizeUnit: null,
                })}
              >
                {card.sizeText ||
                  (card.size
                    ? `${card.size} ${card.sizeUnit || ""}`
                    : "Указать размер")}
              </InlineField>
            </Field>
            <CardPropertyFields properties={model.properties} />
          </dl>
          {model.blockers
            .filter((item) => !item.released)
            .map((item) => (
              <div key={item.id} className={styles.blocked}>
                Заблокирована: {item.reason || "Причина не указана"}
              </div>
            ))}
          <Section title="Описание">
            <InlineField
              id="description"
              label="Описание"
              kind="rich"
              value={card.description}
              toChanges={(description) => ({ description })}
            >
              <RichText
                text={card.description}
                imageMap={model.imageMap}
                onPreview={setPreview}
              />
            </InlineField>
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
                    <input
                      type="checkbox"
                      checked={item.checked}
                      aria-label={`Выполнено: ${item.text.replace(/<[^>]*>/g, "").slice(0, 100)}`}
                      disabled={
                        !editing.enabled || !!editing.active || editing.pending
                      }
                      onChange={(event) =>
                        editing.save({
                          version: card.version,
                          changes: {
                            checklistItems: [
                              { id: item.id, checked: event.target.checked },
                            ],
                          },
                        })
                      }
                    />
                    <div>
                      <InlineField
                        id={`checklist:${item.id}`}
                        label="Пункт чек-листа"
                        kind="rich"
                        value={item.text}
                        toChanges={(text) => ({
                          checklistItems: [{ id: item.id, text }],
                        })}
                      >
                        <RichText
                          text={item.text}
                          imageMap={model.imageMap}
                          onPreview={setPreview}
                        />
                      </InlineField>
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
                ] as const
              ).map(([label, date]) => (
                <Field key={label} label={label}>
                  {formatDate(date)}
                </Field>
              ))}
              {(
                [
                  ["Завершена", "completedAt"],
                  ["Плановое начало", "plannedStart"],
                  ["Плановое окончание", "plannedEnd"],
                ] as const
              ).map(([label, key]) => (
                <Field key={key} label={label}>
                  <InlineField
                    id={key}
                    label={label}
                    kind="date"
                    value={inputDate(card[key])}
                    toChanges={(value) => ({ [key]: savedDate(value) })}
                  >
                    {card[key] ? formatDate(card[key]) : "Указать дату"}
                  </InlineField>
                </Field>
              ))}
              <Field label="Подписчики">
                <InlineSelection
                  kind="subscribers"
                  label="Подписчики"
                  selected={model.subscribers}
                />
              </Field>
              <Field label="Внешний ID">
                <InlineField
                  id="externalId"
                  label="Внешний ID"
                  value={card.externalId || ""}
                  toChanges={(value) => ({ externalId: value || null })}
                >
                  {card.externalId || "Указать ID"}
                </InlineField>
              </Field>
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
            <p>Исходные сведения, сохранённые при переносе карточки.</p>
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
        <CardTimeline
          model={model}
          files={files}
          onPreview={setPreview}
          hidden={panelHidden}
        />
      </div>
      <ImagePreview
        url={preview}
        files={files}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
