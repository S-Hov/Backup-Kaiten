import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "BOARD_");
  const apiTarget = env.BOARD_API_PROXY_TARGET || "http://127.0.0.1:8766";
  // FastAPI accepts localhost hosts; Docker's internal service name is routing only.
  const apiProxy = { target: apiTarget, headers: { host: "127.0.0.1" } };
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": new URL("./src", import.meta.url).pathname.replace(
          /^\/(\w:)/,
          "$1",
        ),
      },
    },
    // /assets is reserved for archive attachments in the backend.
    build: { assetsDir: "static" },
    server: {
      port: 5173,
      strictPort: true,
      watch: { usePolling: env.BOARD_WATCH_POLLING === "1" },
      proxy: {
        "/api": apiProxy,
        "/assets": apiProxy,
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: false,
    },
  };
});
