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

  const repository = c.get("repository");
  const outcome = await repository.search(parsed.data);

  // §3.3 search analytics — fire-and-forget so recording never delays or
  // fails the response (fixtures mode has no recorder and skips this).
  if (repository.recordSearchEvent) {
    const recording = repository
      .recordSearchEvent(parsed.data.q, outcome.items.length === 0)
      .catch(() => {});
    try {
      c.executionCtx.waitUntil(recording);
    } catch {
      // Node dev server has no ExecutionContext — the promise runs detached
    }
  }

  const body: SearchResponse = {
    data: outcome.items,
    meta: { requestId: c.get("requestId"), nextCursor: outcome.nextCursor },
  };
  // no-store until the edge-cache layer (§11) caches data separately from the
  // per-request meta.requestId envelope
  c.header("Cache-Control", "no-store");
  return c.json(body);
});
