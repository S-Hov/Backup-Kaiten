import { Toaster, toast } from "sonner";
import "sonner/dist/styles.css";
import "./notifications.scss";

export const notify = toast;
export function Notifications() {
  return (
    <Toaster
      position="bottom-right"
      containerAriaLabel="Уведомления"
      customAriaLabel="Уведомления"
      closeButton
      toastOptions={{
        className: "app-toast",
        closeButtonAriaLabel: "Закрыть уведомление",
      }}
    />
  );
}
