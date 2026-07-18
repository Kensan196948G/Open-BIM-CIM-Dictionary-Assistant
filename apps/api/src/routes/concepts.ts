import type { ConceptDetailResponse, ConceptRelationsResponse } from "@obcda/contracts";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../middleware/context";
import { errorResponse } from "../middleware/errors";

const IdSchema = z.uuid();

export const conceptRoutes = new Hono<AppEnv>();

conceptRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!IdSchema.safeParse(id).success) {
    return errorResponse(c, "VALIDATION_ERROR", "入力内容を確認してください。", [
      { field: "id", reason: "must_be_uuid" },
    ]);
  }
  const detail = await c.get("repository").getConceptById(id);
  if (!detail) {
    return errorResponse(c, "NOT_FOUND", "指定された用語が見つかりません。");
  }
  const body: ConceptDetailResponse = {
    data: detail,
    meta: { requestId: c.get("requestId"), nextCursor: null },
  };
  // no-store until the edge-cache layer (§11) separates data from requestId
  c.header("Cache-Control", "no-store");
  return c.json(body);
});

conceptRoutes.get("/:id/relations", async (c) => {
  const id = c.req.param("id");
  if (!IdSchema.safeParse(id).success) {
    return errorResponse(c, "VALIDATION_ERROR", "入力内容を確認してください。", [
      { field: "id", reason: "must_be_uuid" },
    ]);
  }
  const relations = await c.get("repository").getRelations(id);
  if (relations === null) {
    return errorResponse(c, "NOT_FOUND", "指定された用語が見つかりません。");
  }
  const body: ConceptRelationsResponse = {
    data: relations,
    meta: { requestId: c.get("requestId"), nextCursor: null },
  };
  // no-store until the edge-cache layer (§11) separates data from requestId
  c.header("Cache-Control", "no-store");
  return c.json(body);
});
