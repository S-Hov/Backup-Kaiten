import { useState } from "react";

/** Optional browser preferences must not prevent opening the card. */
export function useStoredFlag(key: string, fallback = false) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? fallback : stored === "true";
    } catch {
      return fallback;
    }
  });
  function toggle() {
    setValue((current) => {
      const next = !current;
      try {
        localStorage.setItem(key, String(next));
      } catch {
        /* Storage can be disabled. */
      }
      return next;
    });
  }
  return [value, toggle] as const;
}
