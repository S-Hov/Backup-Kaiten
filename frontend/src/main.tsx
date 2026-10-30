import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app";
import { QueryProvider } from "@/app/providers";
import { initializeTheme } from "@/shared/lib/theme";
import "@/app/styles/main.scss";

initializeTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </StrictMode>,
);
