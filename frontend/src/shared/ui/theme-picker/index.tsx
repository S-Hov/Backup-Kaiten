import { useId } from "react";
import { themes, setTheme, useTheme } from "@/shared/lib/theme";
import { Icon } from "@/shared/ui/icon";
import styles from "./ThemePicker.module.scss";

export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  const groupName = useId();
  return (
    <div data-compact={compact} className={styles.picker}>
      <fieldset className={styles.themePicker}>
        <legend>Оформление</legend>
        <div className={styles.themeOptions}>
          {themes.map(({ id, label }) => (
            <label className={styles.themeOption} key={id}>
              <input
                type="radio"
                name={groupName}
                value={id}
                checked={theme === id}
                onChange={() => setTheme(id)}
              />
              <span className={styles.themeTile}>
                <span
                  className={styles.themePreview}
                  data-theme-preview={id}
                  aria-hidden="true"
                >
                  <span className={styles.previewSidebar} />
                  <span className={styles.previewCard} />
                  <span className={styles.previewCard} />
                </span>
                <span className={styles.themeLabel}>
                  {label}
                  <span className={styles.themeCheck} aria-hidden="true">
                    <Icon name="check" size={14} />
                  </span>
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
