import { defineConfig, devices } from "@playwright/test";

/**
 * E2E: real browser against the vite dev server, which proxies /api to a
 * fixtures-backed API instance on a dedicated port (18788 — chosen to avoid
 * the default 8787 that may be taken by other local services).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "line" : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  // channel "chromium" = full-browser new headless; the separate
  // chrome-headless-shell binary SIGTRAPs on this Ubuntu kernel
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @obcda/api dev",
      url: "http://localhost:18788/api/v1/health/live",
      reuseExistingServer: false,
      env: { PORT: "18788" },
      timeout: 60_000,
    },
    {
      // invoke vite directly: `pnpm run dev -- --port` would re-interpret the
      // `--` separator and drop the flags (vite would pick a random port)
      command: "pnpm exec vite --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: "http://localhost:18788" },
      timeout: 60_000,
    },
  ],
});
