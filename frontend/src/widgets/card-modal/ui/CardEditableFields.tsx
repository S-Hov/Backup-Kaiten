import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { boardQueries, columnTree, leafColumns } from "@/entities/board";
import type { CardDetail } from "@/entities/card";
import { Value } from "@/shared/ui";
import { useCardEditing, EditActions } from "./CardEditing";
import { InlineField } from "./InlineField";
import styles from "./InlineEdit.module.scss";

export function CatalogField({
  id,
  label,
  value,
  children,
}: {
  id: "type";
  label: string;
  value: string;
  children: ReactNode;
}) {
  const editing = useCardEditing();
  if (editing.active === id && !editing.options.isSuccess)
    return <OptionsState />;
  return (
    <InlineField
      id={id}
      label={label}
      value={value}
      kind="select"
      options={editing.options.data?.types}
      toChanges={(typeId) => ({ typeId: typeId || null })}
    >
      {children}
    </InlineField>
  );
}
function OptionsState() {
  const editing = useCardEditing();
  return (
    <div className={styles.editor}>
      {editing.options.error ? (
        <p role="alert">
          {editing.options.error.message}{" "}
          <button type="button" onClick={() => void editing.options.refetch()}>
            Повторить
          </button>
        </p>
      ) : (
        <p role="status">Загружаем варианты…</p>
      )}
      <button type="button" onClick={editing.cancel}>
        Отмена
      </button>
    </div>
  );
}

export function LocationField({ field }: { field: "column" | "lane" }) {
  const editing = useCardEditing();
  const card = editing.model!.card;
  const query = useQuery({
    ...boardQueries.structure(card.board?.id || ""),
    enabled: editing.active === field && !!card.board,
  });
  if (editing.active === field) {
    if (!query.data)
      return (
        <div className={styles.editor}>
          {query.error ? (
            <p role="alert">
              {query.error.message}
              <button type="button" onClick={() => void query.refetch()}>
                Повторить
              </button>
            </p>
          ) : (
            <p role="status">Загружаем колонки…</p>
          )}
          <button type="button" onClick={editing.cancel}>
            Отмена
          </button>
        </div>
      );
    let columns;
    try {
      columns = leafColumns(columnTree(query.data.columns));
    } catch {
      return (
        <div role="alert">
          Не удалось прочитать структуру доски.{" "}
          <button onClick={editing.cancel}>Отмена</button>
        </div>
      );
    }
    return (
      <LocationEditor
        columns={columns.map((item) => ({ id: item.id, name: item.title }))}
        lanes={query.data.lanes.map((item) => ({
          id: item.id,
          name: item.title,
        }))}
      />
    );
  }
  return (
    <InlineField
      id={field}
      label={field === "column" ? "Колонка" : "Дорожка"}
      value=""
      toChanges={() => ({})}
    >
      {field === "column"
        ? card.column?.title || "Не указана"
        : card.lane?.title || "Основная дорожка"}
    </InlineField>
  );
}
function LocationEditor({
  columns,
  lanes,
}: {
  columns: { id: string; name: string }[];
  lanes: { id: string; name: string }[];
}) {
  const editing = useCardEditing();
  const [original] = useState(editing.model!.card);
  const [columnId, setColumn] = useState(original.column?.id || "");
  const [laneId, setLane] = useState(original.lane?.id || "");
  const dirty =
    columnId !== (original.column?.id || "") ||
    laneId !== (original.lane?.id || "");
  useEffect(() => {
    editing.setDirty(dirty);
  }, [dirty, editing.setDirty]);
  return (
    <form
      className={styles.editor}
      aria-label="Изменение: положение карточки"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && columnId && (!lanes.length || laneId))
          editing.save({
            version: original.version,
            location: { columnId, laneId: laneId || null },
          });
      }}
    >
      <label>
        Колонка
        <select
          autoFocus
          value={columnId}
          disabled={editing.pending}
          onChange={(event) => setColumn(event.target.value)}
        >
          <option value="" disabled>
            Выберите колонку
          </option>
          {columns.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {lanes.length > 0 && (
        <label>
          Дорожка
          <select
            value={laneId}
            disabled={editing.pending}
            onChange={(event) => setLane(event.target.value)}
          >
            <option value="" disabled>
              Выберите дорожку
            </option>
            {lanes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <span className={styles.empty}>
        Карточка встанет в конец выбранной колонки и дорожки.
      </span>
      <EditActions disabled={!columnId || (!!lanes.length && !laneId)} />
    </form>
  );
}

export function CustomPropertyField({
  property,
}: {
  property: CardDetail["properties"][number];
}) {
  const editing = useCardEditing();
  const id = `properties:${property.id}`;
  if (editing.active === id && !editing.options.isSuccess)
    return <OptionsState />;
  const definition = editing.options.data?.properties.find(
    (item) => item.id === property.id,
  );
  if (editing.active === id)
    return (
      <PropertyEditor property={property} options={definition?.options || []} />
    );
  // Complex read-only source values remain readable instead of exposing JSON as an input.
  if (
    property.rawValue !== null &&
    typeof property.rawValue === "object" &&
    !Array.isArray(property.rawValue)
  )
    return <Value value={property.value} />;
  return (
    <InlineField id={id} label={property.name} value="" toChanges={() => ({})}>
      <Value value={property.value} />
    </InlineField>
  );
}

export function CardPropertyFields({
  properties,
}: {
  properties: CardDetail["properties"];
}) {
  const editing = useCardEditing();
  const [added, setAdded] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const extra = (editing.options.data?.properties || [])
    .filter(
      (item) =>
        added.includes(item.id) &&
        !properties.some((value) => value.id === item.id),
    )
    .map((item) => ({ ...item, value: null, rawValue: null }));
  const available = (editing.options.data?.properties || []).filter(
    (item) =>
      !properties.some((value) => value.id === item.id) &&
      !added.includes(item.id) &&
      item.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      {[...properties, ...extra].map((property) => (
        <div key={property.id}>
          <dt>{property.name}</dt>
          <dd>
            <CustomPropertyField property={property} />
          </dd>
        </div>
      ))}
      {editing.enabled && (
        <div>
          <dt>Дополнительные поля</dt>
          <dd>
            {editing.active === "properties:add" ? (
              <div className={styles.editor}>
                {!editing.options.isSuccess ? (
                  <OptionsState />
                ) : (
                  <>
                    <input
                      autoFocus
                      aria-label="Поиск дополнительных полей"
                      placeholder="Найти поле…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    <div className={styles.results}>
                      {available.map((property) => (
                        <button
                          key={property.id}
                          type="button"
                          onClick={() => {
                            setAdded((old) => [...old, property.id]);
                            editing.begin(`properties:${property.id}`);
                          }}
                        >
                          {property.name}
                        </button>
                      ))}
                    </div>
                    {!available.length && (
                      <span className={styles.empty}>Нет доступных полей</span>
                    )}
                    <button type="button" onClick={editing.cancel}>
                      Отмена
                    </button>
                  </>
                )}
              </div>
            ) : (
              <button
                type="button"
                className={styles.add}
                onClick={() => {
                  setSearch("");
                  editing.begin("properties:add");
                }}
              >
                + Добавить поле
              </button>
            )}
          </dd>
        </div>
      )}
    </>
  );
}
function PropertyEditor({
  property,
  options,
}: {
  property: CardDetail["properties"][number];
  options: { id: string; name: string }[];
}) {
  const editing = useCardEditing();
  const [version] = useState(editing.model!.card.version);
  const [draft, setDraft] = useState(property.rawValue);
  const [query, setQuery] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(property.rawValue);
  const numeric = ["number", "numeric"].includes(property.type.toLowerCase());
  const boolean = ["boolean", "checkbox"].includes(property.type.toLowerCase());
  const multiple =
    Array.isArray(property.rawValue) ||
    property.type.toLowerCase().includes("multi");
  useEffect(() => {
    editing.setDirty(dirty);
  }, [dirty, editing.setDirty]);
  return (
    <form
      className={styles.editor}
      aria-label={`Изменение: ${property.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty)
          editing.save({
            version,
            changes: { properties: [{ id: property.id, value: draft }] },
          });
      }}
    >
      {options.length ? (
        <>
          <input
            autoFocus
            aria-label={`Поиск: ${property.name}`}
            placeholder="Найти значение…"
            value={query}
            disabled={editing.pending}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className={styles.results}>
            {options
              .filter((item) =>
                item.name.toLowerCase().includes(query.toLowerCase()),
              )
              .map((item) => {
                const selected = Array.isArray(draft)
                  ? draft.map(String).includes(item.id)
                  : String(draft) === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    disabled={editing.pending}
                    aria-pressed={selected}
                    onClick={() =>
                      setDraft((old) =>
                        multiple
                          ? selected
                            ? (Array.isArray(old) ? old : []).filter(
                                (value) => String(value) !== item.id,
                              )
                            : [...(Array.isArray(old) ? old : []), item.id]
                          : item.id,
                      )
                    }
                  >
                    {selected ? "✓ " : ""}
                    {item.name}
                  </button>
                );
              })}
          </div>
        </>
      ) : boolean ? (
        <select
          autoFocus
          aria-label={property.name}
          value={draft === null ? "" : String(draft)}
          disabled={editing.pending}
          onChange={(event) =>
            setDraft(
              event.target.value === "" ? null : event.target.value === "true",
            )
          }
        >
          <option value="">Не указано</option>
          <option value="true">Да</option>
          <option value="false">Нет</option>
        </select>
      ) : (
        <input
          autoFocus
          aria-label={property.name}
          type={numeric ? "number" : "text"}
          step="any"
          value={draft === null ? "" : String(draft)}
          disabled={editing.pending}
          onChange={(event) =>
            setDraft(
              event.target.value === ""
                ? null
                : numeric
                  ? Number(event.target.value)
                  : event.target.value,
            )
          }
        />
      )}
      {draft !== null && (
        <button
          type="button"
          className={styles.add}
          disabled={editing.pending}
          onClick={() => setDraft(null)}
        >
          Очистить значение
        </button>
      )}
      <EditActions />
    </form>
  );
}
