import { z } from "zod";

import { ResponseMetaSchema } from "./common";

/**
 * Admin-managed Anthropic AI settings (§6.4, 管理者設定).
 * The key is stored server-side (Neon app_settings / env secret) and is never
 * returned to the browser — the status exposes only whether it is configured
 * plus the last 4 characters for operator confirmation.
 */
export const ANTHROPIC_API_KEY_PREFIX = "sk-ant-";

export const AiSettingsStatusSchema = z.object({
  /** True when an API key is available (env secret or stored setting). */
  configured: z.boolean(),
  /** Where the active key comes from. */
  source: z.enum(["env", "stored", "none"]),
  /** Last 4 characters of the active key (for operator confirmation). */
  maskedKey: z.string().nullable(),
  /** Model id used for AI answers. */
  model: z.string().nullable(),
});
export type AiSettingsStatus = z.infer<typeof AiSettingsStatusSchema>;

export const AiSettingsStatusResponseSchema = z.object({
  data: AiSettingsStatusSchema,
  meta: ResponseMetaSchema,
});
export type AiSettingsStatusResponse = z.infer<typeof AiSettingsStatusResponseSchema>;

/** PUT/POST body — the key travels only from the admin browser to the API. */
export const SaveAiSettingsSchema = z.object({
  apiKey: z.string().trim().min(10).max(512),
});
export type SaveAiSettings = z.infer<typeof SaveAiSettingsSchema>;

/** Test body — optional key; when omitted the active stored/env key is tested. */
export const TestAiSettingsSchema = z.object({
  apiKey: z.string().trim().min(10).max(512).optional(),
});
export type TestAiSettings = z.infer<typeof TestAiSettingsSchema>;

export const TestAiSettingsResponseSchema = z.object({
  data: z.object({
    ok: z.literal(true),
    model: z.string(),
    latencyMs: z.number().nonnegative(),
  }),
  meta: ResponseMetaSchema,
});
export type TestAiSettingsResponse = z.infer<typeof TestAiSettingsResponseSchema>;

/**
 * GET /api/v1/admin/ai-usage — AI 運用メトリクス（FR-208 の MVP）.
 * Privacy: events carry token counts and timing only — no question text,
 * no answer text, no IP (§12.1).
 */
export const AiUsageEventSchema = z.object({
  occurredAt: z.iso.datetime(),
  requestId: z.string(),
  provider: z.string(),
  model: z.string().nullable(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  insufficientEvidence: z.boolean(),
});
export type AiUsageEvent = z.infer<typeof AiUsageEventSchema>;

export const AiUsageSummarySchema = z.object({
  totalRequests: z.number().int().nonnegative(),
  totalInputTokens: z.number().int().nonnegative(),
  totalOutputTokens: z.number().int().nonnegative(),
  averageLatencyMs: z.number().nonnegative(),
  insufficientEvidenceCount: z.number().int().nonnegative(),
  /** When this in-memory window started (isolate lifetime). */
  windowStartedAt: z.iso.datetime(),
});
export type AiUsageSummary = z.infer<typeof AiUsageSummarySchema>;

export const AiUsageResponseSchema = z.object({
  data: z.object({
    summary: AiUsageSummarySchema,
    budget: z.object({
      /** Daily token cap (input+output); null = no cap configured. */
      dailyTokenBudget: z.number().int().positive().nullable(),
      usedToday: z.number().int().nonnegative(),
      exhausted: z.boolean(),
    }),
    recent: z.array(AiUsageEventSchema),
  }),
  meta: ResponseMetaSchema,
});
export type AiUsageResponse = z.infer<typeof AiUsageResponseSchema>;
