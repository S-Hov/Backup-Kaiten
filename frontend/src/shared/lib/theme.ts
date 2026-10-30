export const themes = [
  { id: "light", label: "Светлая" },
  { id: "warm", label: "Бумажная" },
  { id: "dark", label: "Тёмная" },
  { id: "midnight", label: "Чёрная" },
  { id: "monochrome", label: "Монохромная" },
  { id: "github", label: "GitHub Dark" },
] as const;

export type Theme = (typeof themes)[number]["id"];

export function isTheme(value: unknown): value is Theme {
  return themes.some(({ id }) => id === value);
}

const storageKey = "kaiten-theme";

export function initializeTheme() {
  let theme: Theme = "light";
  try {
    const stored = localStorage.getItem(storageKey);
    if (isTheme(stored)) theme = stored;
  } catch {
    /* Browser preferences can be unavailable. */
  }
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    /* Switching still works when storage is disabled. */
  }
}
