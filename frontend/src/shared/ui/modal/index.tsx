import { useEffect, useRef } from "react";
import styles from "./Modal.module.scss";

/** Native top-layer dialog provides focus trapping, Escape and an inert background. */
export function Modal({
  children,
  labelledBy,
  onClose,
  closeLabel = "Закрыть карточку",
  dismissible = true,
  size = "large",
}: {
  children: React.ReactNode;
  labelledBy: string;
  onClose: () => void;
  closeLabel?: string;
  dismissible?: boolean;
  size?: "large" | "compact";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.modal}
      data-size={size}
      onCancel={(event) => {
        if (!dismissible) event.preventDefault();
      }}
      aria-labelledby={labelledBy}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClick={(event) => {
        if (!dismissible) return;
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          event.currentTarget.close();
      }}
    >
      <button
        className={styles.close}
        onClick={() => dialog.current?.close()}
        aria-label={closeLabel}
        disabled={!dismissible}
        autoFocus
      >
        ×
      </button>
      {children}
    </dialog>
  );
}
