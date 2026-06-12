import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ["node_modules/**", "dist/**", "e2e/**"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:8002",
        changeOrigin: true,
        // Session/retro WebSockets live under /api/v1/(retro-)ws — without
        // ws:true the dev server drops the upgrade and live updates never arrive.
        ws: true,
      },
      "/ws": {
        target: process.env.VITE_WS_URL || "ws://localhost:8002",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
