import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // dev: forward API calls to the local Hono server (pnpm --filter @obcda/api dev).
      // E2E overrides the target to avoid port collisions (see playwright.config.ts).
      "/api": process.env["API_PROXY_TARGET"] ?? "http://localhost:8787",
    },
  },
});
