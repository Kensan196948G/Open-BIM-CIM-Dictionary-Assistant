import type { SourcesResponse, SourceVersionsResponse } from "@obcda/contracts";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../middleware/context";
import { errorResponse } from "../middleware/errors";

const IdSchema = z.uuid();

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

sourceRoutes.get("/:id/versions", async (c) => {
  const id = c.req.param("id");
  if (!IdSchema.safeParse(id).success) {
    return errorResponse(c, "VALIDATION_ERROR", "入力内容を確認してください。", [
      { field: "id", reason: "must_be_uuid" },
    ]);
  }
  const versions = await c.get("repository").getSourceVersions(id);
  if (versions === null) {
    return errorResponse(c, "NOT_FOUND", "指定された情報源が見つかりません。");
  }
  const body: SourceVersionsResponse = {
    data: versions,
    meta: { requestId: c.get("requestId"), nextCursor: null },
  };
  c.header("Cache-Control", "no-store");
  return c.json(body);
});
