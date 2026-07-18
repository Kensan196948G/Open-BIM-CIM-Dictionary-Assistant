import type { MiddlewareHandler } from "hono";

import type { AuditLog } from "../services/auditLog";
import type { AppEnv } from "./context";

/**
 * Records one audit entry per API request (§3.3). Path only — never the query
 * string (search terms / AI questions would leak into the trail, §8.3).
 * The audit-read endpoint itself is excluded to keep the trail signal-only.
 */
export function auditTrail(log: AuditLog): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const startedAt = Date.now();
    try {
      await next();
    } finally {
      const path = c.req.path;
      if (path !== "/api/v1/system/audit-events") {
        log.record({
          id: crypto.randomUUID(),
          occurredAt: new Date(startedAt).toISOString(),
          method: c.req.method,
          path,
          status: c.res.status,
          requestId: c.get("requestId") ?? "unknown",
          durationMs: Date.now() - startedAt,
        });
      }
    }
  };
}
