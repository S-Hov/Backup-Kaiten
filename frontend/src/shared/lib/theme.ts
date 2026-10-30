export type Theme = "light" | "dark";

const storageKey = "kaiten-theme";

export function initializeTheme() {
  let theme: Theme = "light";
  try {
    if (localStorage.getItem(storageKey) === "dark") theme = "dark";
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
