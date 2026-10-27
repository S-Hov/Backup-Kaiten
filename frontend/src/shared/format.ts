import type { Person } from "../api/types";

export const number = (n: number | null | undefined) =>
  new Intl.NumberFormat("ru-RU").format(n ?? 0);
export const fullName = (user?: Person) =>
  user?.full_name || user?.name || user?.username || "Неизвестный участник";
export const initials = (user?: Person) =>
  fullName(user)
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
export function formatDate(value?: string | null, time = true): string {
  if (!value) return "Не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Moscow",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}
export function fileSize(n?: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} Б`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 ** 2).toFixed(1)} МБ`;
}
