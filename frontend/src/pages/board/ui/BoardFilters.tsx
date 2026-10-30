import { Icon } from "@/shared/ui/icon";
import styles from "./BoardControls.module.scss";

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
  users: { id: string; name: string }[];
  dateField: "created" | "updated" | "due";
  dateFrom: string;
  dateTo: string;
  onRemove: (
    filter: "search" | "tag" | "archived" | "user" | "date",
    tagId?: string,
  ) => void;
  onClear: () => void;
}) {
  if (
    !search &&
    !tags.length &&
    !archived &&
    !users.length &&
    !dateFrom &&
    !dateTo
  )
    return null;
  const dateLabel = {
    created: "Дата создания",
    updated: "Дата обновления",
    due: "Срок выполнения",
  }[dateField];
  const formatDate = (value: string) => value.split("-").reverse().join(".");
  const items = [
    ...users.map((user) => ({
      key: "user" as const,
      id: user.id,
      label: `Пользователь: ${user.name}`,
    })),
    ...(dateFrom || dateTo
      ? [
          {
            key: "date" as const,
            id: "date",
            label: `${dateLabel}: ${dateFrom ? `с ${formatDate(dateFrom)}` : ""}${dateFrom && dateTo ? " " : ""}${dateTo ? `по ${formatDate(dateTo)}` : ""}`,
          },
        ]
      : []),
    ...tags.map((tag) => ({
      key: "tag" as const,
      id: tag.id,
      label: `Метка: ${tag.name}`,
    })),
    ...(search
      ? [{ key: "search" as const, id: "search", label: `Поиск: ${search}` }]
      : []),
    ...(archived
      ? [{ key: "archived" as const, id: "archived", label: "Архив" }]
      : []),
  ];
  return (
    <section className={styles.filters} aria-label="Активные фильтры">
      <span className={styles.filterLabel}>Фильтры</span>
      <div className={styles.filterItems}>
        {items.map((item) => (
          <button
            key={`${item.key}:${item.id}`}
            className={styles.filterChip}
            onClick={() => onRemove(item.key, item.id)}
            aria-label={`Убрать фильтр «${item.label}»`}
          >
            <span>{item.label}</span>
            <Icon name="close" size={14} />
          </button>
        ))}
      </div>
      <button className={styles.clearFilters} onClick={onClear}>
        Очистить
      </button>
    </section>
  );
}
