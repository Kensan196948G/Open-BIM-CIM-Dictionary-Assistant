import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "./context";
import { errorResponse } from "./errors";

export type RateLimitOptions = {
  /** Max requests allowed per window (per client, per scope). */
  limit: number;
  windowMs: number;
  /** Bucket namespace so route groups don't share counters. */
  scope: string;
  /** Injectable clock for tests; defaults to Date.now. */
  now?: () => number;
};

/** §9.2 route-group limits (per client IP, per isolate). */
export const RATE_LIMITS = {
  search: { scope: "search", limit: 60, windowMs: 60_000 },
  compare: { scope: "compare", limit: 30, windowMs: 60_000 },
  assistant: { scope: "assistant", limit: 10, windowMs: 600_000 },
  admin: { scope: "admin", limit: 20, windowMs: 60_000 },
} as const satisfies Record<string, Omit<RateLimitOptions, "now">>;

/** Bound bucket-map growth: stale windows are swept past this size. */
const MAX_TRACKED_BUCKETS = 10_000;

/**
 * Fixed-window in-memory rate limiter (§9.2). Per-isolate best effort:
 * Workers isolates don't share state, so this bounds abuse per isolate
 * rather than globally — that is still the difference between an unbounded
 * token-spend on the AI endpoint and a hard per-client ceiling. A KV/Durable
 * Object-backed limiter is the scale-up path.
 *
 * Privacy (§9.2「IPはレート制御にのみ利用し、原則として永続保存しない」):
 * the client IP is used only as an in-memory bucket key — never logged,
 * never persisted, gone when the isolate is recycled.
 */
export const rateLimit = (options: RateLimitOptions): MiddlewareHandler<AppEnv> => {
  const buckets = new Map<string, { windowStart: number; count: number }>();
  const now = options.now ?? Date.now;

  return async (c, next) => {
    const clientIp = c.req.header("cf-connecting-ip") ?? "unknown";
    const key = `${options.scope}:${clientIp}`;
    const at = now();

    const bucket = buckets.get(key);
    if (!bucket || at - bucket.windowStart >= options.windowMs) {
      if (buckets.size >= MAX_TRACKED_BUCKETS) {
        for (const [staleKey, staleBucket] of buckets) {
          if (at - staleBucket.windowStart >= options.windowMs) {
            buckets.delete(staleKey);
          }
        }
      }
      buckets.set(key, { windowStart: at, count: 1 });
    } else if (bucket.count >= options.limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.windowStart + options.windowMs - at) / 1000),
      );
      c.header("Retry-After", String(retryAfterSeconds));
      return errorResponse(
        c,
        "RATE_LIMITED",
        "リクエストが多すぎます。しばらく待ってから再試行してください。",
      );
    } else {
      bucket.count += 1;
    }

    await next();
  };
};
