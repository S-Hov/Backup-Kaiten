import { useState } from "react";
import type { Json } from "@/shared/api";

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="section-empty">{children}</p>;
}
export function Avatar({ label }: { label: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {label
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()}
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
