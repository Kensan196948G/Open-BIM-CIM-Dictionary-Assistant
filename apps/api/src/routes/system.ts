import {
  AuditEventsQuerySchema,
  type AuditEventsResponse,
  type SystemInfoResponse,
} from "@obcda/contracts";
import { Hono } from "hono";

import packageJson from "../../package.json";
import type { AppEnv } from "../middleware/context";
import { errorResponse, zodDetails } from "../middleware/errors";
import type { AuditLog } from "../services/auditLog";

const STARTED_AT = new Date().toISOString();

export function createSystemRoutes(auditLog: AuditLog, llmProviderId: string) {
  const routes = new Hono<AppEnv>();

  routes.get("/info", async (c) => {
    const stats = await c.get("repository").getStats();
    const body: SystemInfoResponse = {
      data: {
        name: "Open BIM/CIM Dictionary Assistant",
        version: packageJson.version,
        // reflects the actual backing store wiring (fixtures until a
        // DATABASE_URL binding switches the repository to Neon)
        environment: c.env?.DATABASE_URL ? "database" : "fixtures",
        llmProvider: llmProviderId,
        startedAt: STARTED_AT,
        counts: {
          concepts: stats.concepts,
          publishedConcepts: stats.publishedConcepts,
          sources: stats.sources,
        },
      },
      meta: { requestId: c.get("requestId"), nextCursor: null },
    };
    c.header("Cache-Control", "no-store");
    return c.json(body);
  });

  routes.get("/audit-events", (c) => {
    const parsed = AuditEventsQuerySchema.safeParse({
      limit: c.req.query("limit"),
    });
    if (!parsed.success) {
      return errorResponse(
        c,
        "VALIDATION_ERROR",
        "入力内容を確認してください。",
        zodDetails(parsed.error),
      );
    }
    const body: AuditEventsResponse = {
      data: auditLog.list(parsed.data.limit),
      meta: { requestId: c.get("requestId"), nextCursor: null },
    };
    c.header("Cache-Control", "no-store");
    return c.json(body);
  });

  return routes;
}
