import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app";
import { QueryProvider } from "@/app/providers";
import "@/app/styles/main.scss";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </StrictMode>,
);
