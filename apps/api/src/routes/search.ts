import { SearchQuerySchema, type SearchResponse } from "@obcda/contracts";
import { Hono } from "hono";

import type { AppEnv } from "../middleware/context";
import { errorResponse, zodDetails } from "../middleware/errors";

export const searchRoutes = new Hono<AppEnv>();

searchRoutes.get("/", async (c) => {
  const parsed = SearchQuerySchema.safeParse({
    q: c.req.query("q"),
    family: c.req.query("family"),
    type: c.req.query("type"),
    schema: c.req.query("schema"),
    limit: c.req.query("limit"),
    cursor: c.req.query("cursor"),
  });
  if (!parsed.success) {
    return errorResponse(
      c,
      "VALIDATION_ERROR",
      "入力内容を確認してください。",
      zodDetails(parsed.error),
    );
  }

  const outcome = await c.get("repository").search(parsed.data);
  const body: SearchResponse = {
    data: outcome.items,
    meta: { requestId: c.get("requestId"), nextCursor: outcome.nextCursor },
  };
  c.header("Cache-Control", "public, max-age=300");
  return c.json(body);
});
