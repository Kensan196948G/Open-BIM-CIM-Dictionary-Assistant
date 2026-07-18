import type { SourcesResponse } from "@obcda/contracts";
import { Hono } from "hono";

import type { AppEnv } from "../middleware/context";

export const sourceRoutes = new Hono<AppEnv>();

sourceRoutes.get("/", async (c) => {
  const sources = await c.get("repository").listSources();
  const body: SourcesResponse = {
    data: sources,
    meta: { requestId: c.get("requestId"), nextCursor: null },
  };
  c.header("Cache-Control", "public, max-age=3600");
  return c.json(body);
});
