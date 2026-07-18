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
  // no-store until the edge-cache layer (§11) separates data from requestId
  c.header("Cache-Control", "no-store");
  return c.json(body);
});
