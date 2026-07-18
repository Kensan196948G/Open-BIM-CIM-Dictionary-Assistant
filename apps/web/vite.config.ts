import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // dev: forward API calls to the local Hono server (pnpm --filter @obcda/api dev)
      "/api": "http://localhost:8787",
    },
  },
});
