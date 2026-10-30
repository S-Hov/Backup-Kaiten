import type { ComponentProps, ReactNode } from "react";
import { Avatar } from "@/shared/ui";
import { Icon } from "@/shared/ui/icon";
import styles from "./BoardControls.module.scss";

type Filter = "search" | "tag" | "archived" | "user" | "date";

function FilterChip({
  children,
  label,
  onRemove,
}: {
  children: ReactNode;
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className={styles.filterChip}>
      <span className={styles.filterValue} title={label}>
        {children}
      </span>
      <button
        type="button"
        className={styles.removeFilter}
        onClick={onRemove}
        aria-label={`Убрать фильтр «${label}»`}
        title="Убрать фильтр"
      >
        <Icon name="close" size={13} />
      </button>
    </span>
  );
}

function FilterGroup({
  icon,
  label,
  count,
  children,
}: {
  icon: ComponentProps<typeof Icon>["name"];
  label: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <div className={styles.filterGroup} role="group" aria-label={label}>
      <span className={styles.filterGroupLabel}>
        <Icon name={icon} size={15} />
        {label}
        {count !== undefined && (
          <span className={styles.groupCount}>{count}</span>
        )}
      </span>
      {children}
    </div>
  );
}

export function BoardFilters({
  search,
  tags,
  archived,
  users,
  dateField,
  dateFrom,
  dateTo,
  onRemove,
  onClear,
}: {
  search: string;
  tags: { id: string; name: string }[];
  archived: boolean;
  users: { id: string; name: string; avatarUrl?: string | null }[];
  dateField: "created" | "updated" | "due";
  dateFrom: string;
  dateTo: string;
  onRemove: (filter: Filter, id?: string) => void;
  onClear: () => void;
}) {
  const hasDate = !!(dateFrom || dateTo);
  const count =
    users.length +
    tags.length +
    Number(hasDate) +
    Number(!!search) +
    Number(archived);
  if (!count) return null;
  const dateLabel = {
    created: "Дата создания",
    updated: "Дата обновления",
    due: "Срок выполнения",
  }[dateField];
  const formatDate = (value: string) => value.split("-").reverse().join(".");
  const dateValue =
    dateFrom && dateTo
      ? `${formatDate(dateFrom)} — ${formatDate(dateTo)}`
      : dateFrom
        ? `с ${formatDate(dateFrom)}`
        : `по ${formatDate(dateTo)}`;
  const fullDateLabel = `${dateLabel}: ${dateFrom ? `с ${formatDate(dateFrom)}` : ""}${dateFrom && dateTo ? " " : ""}${dateTo ? `по ${formatDate(dateTo)}` : ""}`;

  return (
    <section className={styles.filters} aria-label="Активные фильтры">
      <span className={styles.filterLabel}>
        <Icon name="filter" size={16} />
        Фильтры <span className={styles.filterCount}>{count}</span>
      </span>
      <div className={styles.filterItems}>
        {!!users.length && (
          <FilterGroup icon="users" label="Участники" count={users.length}>
            {users.map((user) => (
              <FilterChip
                key={user.id}
                label={`Пользователь: ${user.name}`}
                onRemove={() => onRemove("user", user.id)}
              >
                <Avatar label={user.name} src={user.avatarUrl} />
                <span className={styles.filterText}>{user.name}</span>
              </FilterChip>
            ))}
          </FilterGroup>
        )}
        {hasDate && (
          <FilterGroup icon="calendar" label={dateLabel}>
            <FilterChip
              label={fullDateLabel}
              onRemove={() => onRemove("date", "date")}
            >
              <span className={styles.filterText}>{dateValue}</span>
            </FilterChip>
          </FilterGroup>
        )}
        {!!tags.length && (
          <FilterGroup icon="tag" label="Метки" count={tags.length}>
            {tags.map((tag) => (
              <FilterChip
                key={tag.id}
                label={`Метка: ${tag.name}`}
                onRemove={() => onRemove("tag", tag.id)}
              >
                <span className={styles.filterText}>{tag.name}</span>
              </FilterChip>
            ))}
          </FilterGroup>
        )}
        {search && (
          <FilterGroup icon="search" label="Поиск">
            <FilterChip
              label={`Поиск: ${search}`}
              onRemove={() => onRemove("search", "search")}
            >
              <span className={styles.filterText}>«{search}»</span>
            </FilterChip>
          </FilterGroup>
        )}
        {archived && (
          <FilterGroup icon="archive" label="Статус">
            <FilterChip
              label="Архив"
              onRemove={() => onRemove("archived", "archived")}
            >
              <span className={styles.filterText}>В архиве</span>
            </FilterChip>
          </FilterGroup>
        )}
      </div>
      <button type="button" className={styles.clearFilters} onClick={onClear}>
        <Icon name="close" size={14} />
        Очистить
      </button>
    </section>
  );
}
