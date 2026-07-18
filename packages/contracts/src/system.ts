import { z } from "zod";

import { ResponseMetaSchema } from "./common";

/** GET /api/v1/system/info — public runtime facts (no secrets, no config values). */
export const SystemInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  /** Data backend currently serving the dictionary. */
  environment: z.enum(["fixtures", "database"]),
  /** Active LLM provider id ("noop" = AI answers degrade to grounding-only). */
  llmProvider: z.string(),
  startedAt: z.iso.datetime(),
  counts: z.object({
    concepts: z.number().int().nonnegative(),
    publishedConcepts: z.number().int().nonnegative(),
    sources: z.number().int().nonnegative(),
  }),
});
export type SystemInfo = z.infer<typeof SystemInfoSchema>;

export const SystemInfoResponseSchema = z.object({
  data: SystemInfoSchema,
  meta: ResponseMetaSchema,
});
export type SystemInfoResponse = z.infer<typeof SystemInfoResponseSchema>;

/**
 * Audit trail entry (§3.3 audit_events の MVP 版).
 * Privacy by design (§8.3/§12.1): method/path/status/timing/requestId only —
 * no query strings, no bodies, no IP addresses, no user agents.
 */
export const AuditEventSchema = z.object({
  id: z.string(),
  occurredAt: z.iso.datetime(),
  method: z.string(),
  path: z.string(),
  status: z.number().int(),
  requestId: z.string(),
  durationMs: z.number().nonnegative(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const AuditEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type AuditEventsQuery = z.infer<typeof AuditEventsQuerySchema>;

export const AuditEventsResponseSchema = z.object({
  data: z.array(AuditEventSchema),
  meta: ResponseMetaSchema,
});
export type AuditEventsResponse = z.infer<typeof AuditEventsResponseSchema>;
