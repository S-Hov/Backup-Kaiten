import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ClipboardEvent,
} from "react";
import { type CardChanges } from "@/entities/card";
import { renderRichText } from "@/shared/lib/rich-text";
import { EditActions, useCardEditing } from "./CardEditing";
import styles from "./InlineEdit.module.scss";

export function InlineField({
  id,
  label,
  value,
  children,
  kind = "text",
  toChanges,
  options,
}: {
  id: string;
  label: string;
  value: string;
  children: ReactNode;
  kind?: "text" | "title" | "rich" | "date" | "select" | "number";
  toChanges: (value: string) => Omit<CardChanges, "version">;
  options?: { id: string; name: string }[];
}) {
  const editing = useCardEditing();
  if (editing.active === id)
    return (
      <FieldEditor key={id} {...{ label, value, kind, toChanges, options }} />
    );
  if (!editing.enabled) return <>{children}</>;
  return (
    <div
      className={`${styles.clickable} ${kind === "title" ? styles.title : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`Изменить: ${label}`}
      title="Нажмите, чтобы изменить"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a, img, button")) return;
        editing.begin(id);
      }}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest("a,button")) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          editing.begin(id);
        }
      }}
    >
      {children || <span className={styles.empty}>Не указано · добавить</span>}
      <span className={styles.pencil} aria-hidden="true">
        ✎
      </span>
    </div>
  );
}

function pasteText(event: ClipboardEvent<HTMLDivElement>) {
  event.preventDefault();
  const selection = window.getSelection();
  if (
    !selection?.rangeCount ||
    !event.currentTarget.contains(selection.anchorNode)
  )
    return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const fragment = document.createDocumentFragment();
  event.clipboardData
    .getData("text/plain")
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (index) fragment.append(document.createElement("br"));
      fragment.append(document.createTextNode(line));
    });
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) {
    range.setStartAfter(last);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  event.currentTarget.dispatchEvent(new Event("input", { bubbles: true }));
}

function FieldEditor({
  label,
  value,
  kind,
  toChanges,
  options,
}: {
  label: string;
  value: string;
  kind: "text" | "title" | "rich" | "date" | "select" | "number";
  toChanges: (value: string) => Omit<CardChanges, "version">;
  options?: { id: string; name: string }[];
}) {
  const editing = useCardEditing();
  const [version] = useState(editing.model!.card.version);
  const [initial] = useState(() =>
    kind === "rich" ? renderRichText(value, editing.model!.imageMap) : value,
  );
  const [draft, setDraft] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  const dirty = draft !== initial;
  useEffect(() => {
    editing.setDirty(dirty);
  }, [dirty, editing.setDirty]);
  useEffect(() => {
    if (kind === "rich") ref.current?.focus();
  }, [kind]);
  const invalid =
    (kind === "title" && (!draft.trim() || draft.trim().length > 500)) ||
    (kind === "rich" && draft.length > 99980);
  function submit() {
    if (!dirty || invalid || editing.pending) return;
    editing.save({
      version,
      changes: toChanges(
        kind === "rich" ? (draft ? `<div>${draft}</div>` : "") : draft.trim(),
      ),
    });
  }
  return (
    <form
      className={styles.editor}
      aria-label={`Изменение: ${label}`}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!editing.pending) editing.cancel();
        }
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          submit();
        }
      }}
    >
      {kind === "rich" ? (
        <div
          ref={ref}
          className={`${styles.richEditor} rich-text`}
          contentEditable={!editing.pending}
          suppressContentEditableWarning
          role="textbox"
          aria-label={label}
          aria-multiline="true"
          onPaste={pasteText}
          dangerouslySetInnerHTML={{ __html: initial }}
          onInput={() =>
            setDraft(
              ref.current?.textContent?.trim() ||
                ref.current?.querySelector("img")
                ? ref.current!.innerHTML
                : "",
            )
          }
        />
      ) : kind === "select" ? (
        <select
          aria-label={label}
          value={draft}
          autoFocus
          disabled={editing.pending}
          onChange={(event) => setDraft(event.target.value)}
        >
          <option value="">Не указано</option>
          {options?.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      ) : kind === "title" ? (
        <textarea
          autoFocus
          aria-label={label}
          required
          maxLength={500}
          rows={2}
          value={draft}
          disabled={editing.pending}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <input
          autoFocus
          aria-label={label}
          type={
            kind === "date"
              ? "datetime-local"
              : kind === "number"
                ? "number"
                : "text"
          }
          step={kind === "number" ? "any" : undefined}
          value={draft}
          disabled={editing.pending}
          onChange={(event) => setDraft(event.target.value)}
        />
      )}
      {kind === "date" && draft && (
        <button
          className={styles.add}
          type="button"
          disabled={editing.pending}
          onClick={() => setDraft("")}
        >
          Убрать дату
        </button>
      )}
      <EditActions disabled={!!invalid} />
    </form>
  );
}

export function inputDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export const savedDate = (value: string) =>
  value ? new Date(value).toISOString() : null;
