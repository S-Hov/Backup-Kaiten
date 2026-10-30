import { useSyncExternalStore } from "react";

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
  window.dispatchEvent(new Event("theme-change"));
}

function subscribe(listener: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) {
      initializeTheme();
      listener();
    }
  }
  window.addEventListener("theme-change", listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("theme-change", listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => {
    const current = document.documentElement.dataset.theme;
    return isTheme(current) ? current : "light";
  });
}
