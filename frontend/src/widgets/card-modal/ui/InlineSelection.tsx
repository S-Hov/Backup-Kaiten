import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cardApi, tagColor, type CardEditOptions } from "@/entities/card";
import { Avatar } from "@/shared/ui";
import { useCardEditing, EditActions } from "./CardEditing";
import styles from "./InlineEdit.module.scss";

type Entry = {
  id: string;
  name: string;
  color?: string | null;
  avatarUrl?: string | null;
  role?: number;
};
export function InlineSelection({
  kind,
  label,
  selected,
}: {
  kind: "tags" | "members" | "subscribers";
  label: string;
  selected: Entry[];
}) {
  const editing = useCardEditing();
  const [remove, setRemove] = useState<string | null>(null);
  const entries = [
    ...new Map(
      [...selected]
        .sort((a, b) => (a.role || 1) - (b.role || 1))
        .map((item) => [item.id, item]),
    ).values(),
  ];
  function open(id: string | null = null) {
    if (editing.begin(kind)) setRemove(id);
  }
  if (editing.active === kind)
    return (
      <SelectionEditor
        kind={kind}
        label={label}
        selected={entries}
        remove={remove}
      />
    );
  return (
    <div className={styles.chips} aria-label={label}>
      {entries.map((item) => (
        <span
          className={styles.chip}
          key={item.id}
          data-color={
            kind === "tags" ? tagColor(item.color || null, item.id) : undefined
          }
        >
          {kind !== "tags" && <Avatar label={item.name} src={item.avatarUrl} />}
          <span onClick={() => editing.enabled && open()}>
            {item.name}
            {item.role === 2 && " · Ответственный"}
          </span>
          {editing.enabled && (
            <button
              type="button"
              aria-label={`Убрать ${kind === "tags" ? "тег" : "участника"} «${item.name}»`}
              onClick={() => open(item.id)}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {!entries.length && !editing.enabled && (
        <span className={styles.empty}>Не указано</span>
      )}
      {editing.enabled && (
        <button type="button" className={styles.add} onClick={() => open()}>
          {kind === "tags"
            ? "+ Добавить тег"
            : kind === "members"
              ? "+ Добавить участника"
              : "+ Добавить подписчика"}
        </button>
      )}
    </div>
  );
}

function SelectionEditor({
  kind,
  label,
  selected,
  remove,
}: {
  kind: "tags" | "members" | "subscribers";
  label: string;
  selected: Entry[];
  remove: string | null;
}) {
  const editing = useCardEditing();
  const client = useQueryClient();
  const [version] = useState(editing.model!.card.version);
  const [initial] = useState(selected);
  const [draft, setDraft] = useState(
    selected.filter((item) => item.id !== remove),
  );
  const [search, setSearch] = useState("");
  const requestIds = useRef(new Map<string, string>());
  const boardId = editing.model!.card.board!.id;
  const dirty =
    JSON.stringify(draft.map(({ id, role }) => [id, role]).sort()) !==
    JSON.stringify(initial.map(({ id, role }) => [id, role]).sort());
  useEffect(() => {
    editing.setDirty(dirty);
  }, [dirty, editing.setDirty]);
  const create = useMutation({
    mutationFn: () => {
      const name = search.trim();
      if (!requestIds.current.has(name))
        requestIds.current.set(name, crypto.randomUUID());
      return cardApi.createTag(boardId, {
        name,
        requestId: requestIds.current.get(name)!,
      });
    },
    retry: false,
    meta: { silent: true },
    onSuccess: (tag) => {
      client.setQueryData<CardEditOptions>(
        ["working", "board", boardId, "edit-options"],
        (old) =>
          old
            ? {
                ...old,
                tags: [...old.tags.filter((item) => item.id !== tag.id), tag],
              }
            : old,
      );
      setDraft((old) =>
        old.some((item) => item.id === tag.id) ? old : [...old, tag],
      );
      setSearch("");
    },
  });
  const options =
    kind === "tags" ? editing.options.data?.tags : editing.options.data?.users;
  const matching = (options || []).filter(
    (item) =>
      !draft.some((entry) => entry.id === item.id) &&
      item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const busy = editing.pending || create.isPending;
  const canCreate =
    kind === "tags" &&
    search.trim() &&
    search.trim().length <= 100 &&
    editing.options.isSuccess &&
    !options?.some(
      (item) =>
        item.name.toLocaleLowerCase() === search.trim().toLocaleLowerCase(),
    );
  return (
    <form
      className={styles.editor}
      aria-label={`Изменение: ${label}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!dirty || busy) return;
        editing.save({
          version,
          changes:
            kind === "tags"
              ? { tagIds: draft.map((item) => item.id) }
              : kind === "subscribers"
                ? { subscriberIds: draft.map((item) => item.id) }
                : {
                    members: draft.map((item) => ({
                      id: item.id,
                      role: item.role === 2 ? 2 : 1,
                    })),
                  },
        });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!busy) editing.cancel();
        }
      }}
    >
      <div className={styles.chips}>
        {draft.map((item) => (
          <span
            className={styles.chip}
            key={item.id}
            data-color={
              kind === "tags"
                ? tagColor(item.color || null, item.id)
                : undefined
            }
          >
            {kind !== "tags" && (
              <Avatar label={item.name} src={item.avatarUrl} />
            )}
            {item.name}
            {kind === "members" && (
              <select
                aria-label={`Роль: ${item.name}`}
                value={item.role === 2 ? 2 : 1}
                disabled={busy}
                onChange={(event) =>
                  setDraft((old) =>
                    old.map((entry) =>
                      entry.id === item.id
                        ? { ...entry, role: Number(event.target.value) }
                        : Number(event.target.value) === 2
                          ? { ...entry, role: 1 }
                          : entry,
                    ),
                  )
                }
              >
                <option value={1}>Участник</option>
                <option value={2}>Ответственный</option>
              </select>
            )}
            <button
              type="button"
              disabled={busy}
              aria-label={`Убрать ${kind === "tags" ? "тег" : "участника"} «${item.name}»`}
              onClick={() =>
                setDraft((old) => old.filter((entry) => entry.id !== item.id))
              }
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        autoFocus
        className={styles.search}
        aria-label={kind === "tags" ? "Поиск тегов" : "Поиск участников"}
        placeholder={
          kind === "tags" ? "Найти или создать тег…" : "Найти по имени…"
        }
        value={search}
        disabled={busy}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (matching.length === 1) {
              setDraft((old) => [...old, matching[0]]);
              setSearch("");
            }
          }
        }}
      />
      {editing.options.isPending && <p role="status">Загружаем список…</p>}
      {editing.options.error && (
        <p className={styles.error} role="alert">
          {editing.options.error.message}{" "}
          <button type="button" onClick={() => void editing.options.refetch()}>
            Повторить
          </button>
        </p>
      )}
      {matching.length > 0 && (
        <div className={styles.results} aria-label="Найденные варианты">
          {matching.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft((old) => [...old, item]);
                setSearch("");
              }}
            >
              {kind !== "tags" && (
                <Avatar
                  label={item.name}
                  src={"avatarUrl" in item ? item.avatarUrl : undefined}
                />
              )}
              + {item.name}
            </button>
          ))}
        </div>
      )}
      {!matching.length && editing.options.isSuccess && (
        <span className={styles.empty}>Ничего не найдено</span>
      )}
      {canCreate && (
        <button
          className={styles.add}
          type="button"
          disabled={busy}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Создаём тег…" : `Создать тег «${search.trim()}»`}
        </button>
      )}
      {create.error && (
        <p className={styles.error} role="alert">
          {create.error.message}
        </p>
      )}
      <EditActions disabled={create.isPending} />
    </form>
  );
}
