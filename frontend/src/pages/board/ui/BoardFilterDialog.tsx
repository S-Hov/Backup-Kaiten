import { useId, useState } from "react";
import type { ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { boardQueries } from "@/entities/board";
import type { BoardLocation } from "@/shared/config";
import { Avatar } from "@/shared/ui";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { FilterChip } from "./BoardFilters";
import styles from "./BoardFilterDialog.module.scss";

type FilterValues = Pick<
  BoardLocation,
  "search" | "tags" | "users" | "dateField" | "dateFrom" | "dateTo" | "archived"
>;
type Option = { id: string; name: string; avatarUrl?: string | null };
const emptyFilters: FilterValues = {
  search: "",
  tags: [],
  users: [],
  dateField: "created",
  dateFrom: "",
  dateTo: "",
  archived: false,
};

function OptionPicker({
  title,
  icon,
  kind,
  options,
  selected,
  onChange,
  loading,
  unavailable,
}: {
  title: string;
  icon: ComponentProps<typeof Icon>["name"];
  kind: "tag" | "user";
  options: Option[];
  selected: Option[];
  onChange: (selected: Option[]) => void;
  loading: boolean;
  unavailable: boolean;
}) {
  const [search, setSearch] = useState("");
  const selectedIds = new Set(selected.map((item) => item.id));
  const all = [
    ...new Map(
      [...options, ...selected].map((item) => [item.id, item]),
    ).values(),
  ];
  const visible = all.filter((item) =>
    item.name
      .toLocaleLowerCase("ru")
      .includes(search.trim().toLocaleLowerCase("ru")),
  );
  return (
    <section className={styles.picker} aria-label={title}>
      <h3>
        <Icon name={icon} size={17} />
        {title}
        <span className={styles.count}>{selected.length}</span>
      </h3>
      <div
        className={styles.selected}
        aria-label={`Выбранные ${kind === "tag" ? "метки" : "участники"}`}
      >
        {selected.length ? (
          selected.map((item) => (
            <FilterChip
              key={item.id}
              label={`${kind === "tag" ? "Метка" : "Пользователь"}: ${item.name}`}
              onRemove={() =>
                onChange(selected.filter((value) => value.id !== item.id))
              }
            >
              {kind === "user" && (
                <Avatar label={item.name} src={item.avatarUrl} />
              )}
              <span className={styles.optionName}>{item.name}</span>
            </FilterChip>
          ))
        ) : (
          <span className={styles.emptySelection}>Не выбраны</span>
        )}
      </div>
      <label className={styles.optionSearch}>
        <Icon name="search" size={15} />
        <input
          type="search"
          aria-label={kind === "tag" ? "Поиск меток" : "Поиск участников"}
          placeholder={kind === "tag" ? "Найти метку…" : "Найти участника…"}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className={styles.options}>
        {loading && <p role="status">Загрузка…</p>}
        {!loading && !visible.length && (
          <p>
            {search.trim()
              ? "Ничего не найдено"
              : unavailable
                ? "Список недоступен"
                : "Список пуст"}
          </p>
        )}
        {visible.map((item) => (
          <label key={item.id} className={styles.option}>
            <input
              type="checkbox"
              checked={selectedIds.has(item.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, item]
                    : selected.filter((value) => value.id !== item.id),
                )
              }
            />
            {kind === "user" ? (
              <Avatar label={item.name} src={item.avatarUrl} />
            ) : (
              <Icon name="tag" size={15} />
            )}
            <span className={styles.optionName} title={item.name}>
              {item.name}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

export function BoardFilterDialog({
  boardId,
  initial,
  onApply,
  onClose,
}: {
  boardId: string;
  initial: FilterValues;
  onApply: (filters: FilterValues) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState<FilterValues>(() => ({
    search: initial.search,
    tags: initial.tags,
    users: initial.users,
    dateField: initial.dateField,
    dateFrom: initial.dateFrom,
    dateTo: initial.dateTo,
    archived: initial.archived,
  }));
  const options = useQuery(boardQueries.filterOptions(boardId));
  function update(patch: Partial<FilterValues>) {
    setDraft((value) => ({ ...value, ...patch }));
  }
  return (
    <Modal
      labelledBy={titleId}
      onClose={onClose}
      closeLabel="Закрыть фильтры"
      size="compact"
    >
      <form
        className={styles.dialog}
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const to = form.elements.namedItem("dateTo") as HTMLInputElement;
          to.setCustomValidity(
            draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo
              ? "Начало периода должно быть не позже окончания"
              : "",
          );
          if (form.reportValidity())
            onApply({ ...draft, search: draft.search.trim() });
        }}
      >
        <header className={styles.header}>
          <h2 id={titleId}>
            <Icon name="filter" size={21} />
            Фильтры
          </h2>
          <p>Настройте условия и нажмите «Применить»</p>
        </header>
        <div className={styles.body}>
          <label className={styles.field}>
            Поиск карточек
            <input
              type="search"
              placeholder="Название, номер или метка"
              maxLength={200}
              value={draft.search}
              onChange={(event) => update({ search: event.target.value })}
            />
          </label>
          <fieldset className={styles.dates}>
            <legend>
              <Icon name="calendar" size={17} />
              Дата
            </legend>
            <label className={styles.field}>
              Поле даты
              <select
                value={draft.dateField}
                onChange={(event) =>
                  update({
                    dateField: event.target.value as FilterValues["dateField"],
                  })
                }
              >
                <option value="created">Дата создания</option>
                <option value="updated">Дата обновления</option>
                <option value="due">Срок выполнения</option>
              </select>
            </label>
            <label className={styles.field}>
              С
              <input
                name="dateFrom"
                type="date"
                value={draft.dateFrom}
                onChange={(event) => {
                  (
                    event.currentTarget.form?.elements.namedItem(
                      "dateTo",
                    ) as HTMLInputElement
                  )?.setCustomValidity("");
                  update({ dateFrom: event.target.value });
                }}
              />
            </label>
            <label className={styles.field}>
              По
              <input
                name="dateTo"
                type="date"
                value={draft.dateTo}
                onChange={(event) => {
                  event.target.setCustomValidity("");
                  update({ dateTo: event.target.value });
                }}
              />
            </label>
          </fieldset>
          {options.isError && (
            <div className={styles.error} role="alert">
              Не удалось загрузить метки и участников.{" "}
              <button type="button" onClick={() => void options.refetch()}>
                Повторить
              </button>
            </div>
          )}
          <div className={styles.pickers}>
            <OptionPicker
              title="Метки"
              icon="tag"
              kind="tag"
              options={options.data?.tags || []}
              selected={draft.tags}
              onChange={(tags) => update({ tags })}
              loading={options.isLoading}
              unavailable={options.isError}
            />
            <OptionPicker
              title="Участники"
              icon="users"
              kind="user"
              options={options.data?.users || []}
              selected={draft.users}
              onChange={(users) => update({ users })}
              loading={options.isLoading}
              unavailable={options.isError}
            />
          </div>
          <label className={styles.archive}>
            <Icon name="archive" size={20} />
            <span>
              <strong>Поиск по архиву</strong>
              <small>Искать среди архивных карточек</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={draft.archived}
              onChange={(event) => update({ archived: event.target.checked })}
            />
          </label>
        </div>
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.reset}
            onClick={(event) => {
              setDraft({ ...emptyFilters });
              const to = event.currentTarget.form?.elements.namedItem(
                "dateTo",
              ) as HTMLInputElement | null;
              to?.setCustomValidity("");
            }}
          >
            <Icon name="refresh" size={16} />
            Сбросить
          </button>
          <button type="submit" className={styles.apply}>
            Применить
          </button>
        </footer>
      </form>
    </Modal>
  );
}
