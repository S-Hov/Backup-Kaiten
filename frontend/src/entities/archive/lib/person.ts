import type { Person } from "../api/types";
export const fullName = (user?: Person) =>
  user?.full_name || user?.name || user?.username || "Неизвестный участник";
export const initials = (user?: Person) =>
  fullName(user)
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
