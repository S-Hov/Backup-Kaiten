import { useMemo, useState } from "react";
import type { Json, Person } from "../api/types";
import { initials } from "./format";
import { renderRichText } from "./rich-text";

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="section-empty">{children}</p>;
}
export function Avatar({ user }: { user?: Person }) {
  return (
    <span className="avatar" aria-hidden="true">
      {initials(user)}
    </span>
  );
}
/** Large raw sections are rendered only when explicitly opened. */
export function Disclosure({
  summary,
  className,
  children,
}: {
  summary: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details
      className={className}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>{summary}</summary>
      {expanded && children}
    </details>
  );
}
export function Value({ value }: { value: Json | undefined }) {
  if (value == null || value === "")
    return <span className="muted">Не указано</span>;
  if (typeof value === "boolean") return <>{value ? "Да" : "Нет"}</>;
  if (Array.isArray(value))
    return value.length ? (
      <>
        {value.map((item, index) => (
          <span key={index}>
            {index > 0 && ", "}
            <Value value={item} />
          </span>
        ))}
      </>
    ) : (
      <span className="muted">Нет</span>
    );
  if (typeof value === "object")
    return (
      <dl className="nested-values">
        {Object.entries(value).map(([key, item]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>
              <Value value={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <>{String(value)}</>;
}
export function RichText({
  text,
  imageMap,
  type,
  onPreview,
}: {
  text?: string;
  imageMap: Record<string, string>;
  type?: number;
  onPreview: (url: string) => void;
}) {
  const html = useMemo(
    () => renderRichText(text ?? "", imageMap, type),
    [text, imageMap, type],
  );
  if (!text) return <Empty>Описание не заполнено</Empty>;
  return (
    <div
      className="rich-text"
      onClick={(event) => {
        const target = event.target;
        if (target instanceof HTMLImageElement && target.dataset.preview)
          onPreview(target.dataset.preview);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
