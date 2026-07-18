import { CompareRequestSchema, type CompareResponse } from "@obcda/contracts";
import { Hono } from "hono";

import type { AppEnv } from "../middleware/context";
import { errorResponse, zodDetails } from "../middleware/errors";

export const compareRoutes = new Hono<AppEnv>();

compareRoutes.post("/", async (c) => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return errorResponse(c, "VALIDATION_ERROR", "入力内容を確認してください。", [
      { field: "(body)", reason: "invalid_json" },
    ]);
  }
  const parsed = CompareRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(
      c,
      "VALIDATION_ERROR",
      "入力内容を確認してください。",
      zodDetails(parsed.error),
    );
  }

  const repository = c.get("repository");
  const details = await Promise.all(
    parsed.data.ids.map((id) => repository.getConceptById(id)),
  );
  const missingIndex = details.findIndex((detail) => detail === null);
  if (missingIndex >= 0) {
    return errorResponse(c, "NOT_FOUND", "指定された用語が見つかりません。", [
      { field: `ids.${missingIndex}`, reason: "unknown_concept_id" },
    ]);
  }

  const body: CompareResponse = {
    data: details as NonNullable<(typeof details)[number]>[],
    meta: { requestId: c.get("requestId"), nextCursor: null },
  };
  c.header("Cache-Control", "no-store");
  return c.json(body);
});
