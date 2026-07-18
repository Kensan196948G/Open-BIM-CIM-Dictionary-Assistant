import { Hono } from "hono";

import type { AppEnv } from "../middleware/context";

export const healthRoutes = new Hono<AppEnv>();

healthRoutes.get("/live", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ status: "ok" });
});

healthRoutes.get("/ready", async (c) => {
  const ready = await c.get("repository").isReady();
  c.header("Cache-Control", "no-store");
  return c.json({ status: ready ? "ok" : "unavailable" }, ready ? 200 : 503);
});
