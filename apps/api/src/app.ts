import { Hono } from "hono";
import { cors } from "hono/cors";

import { accessJwt, type AccessJwtOptions } from "./middleware/accessJwt";
import type { AppEnv } from "./middleware/context";
import { errorResponse } from "./middleware/errors";
import { RATE_LIMITS, rateLimit } from "./middleware/rateLimit";
import { requestId } from "./middleware/requestId";
import { securityHeaders } from "./middleware/securityHeaders";
import type { DictionaryRepository } from "./repositories/types";
import { auditTrail } from "./middleware/audit";
import { createAdminRoutes } from "./routes/admin";
import { createAssistantRoutes } from "./routes/assistant";
import { compareRoutes } from "./routes/compare";
import { conceptRoutes } from "./routes/concepts";
import { exportRoutes } from "./routes/export";
import { healthRoutes } from "./routes/health";
import { searchRoutes } from "./routes/search";
import { sourceRoutes } from "./routes/sources";
import { createSystemRoutes } from "./routes/system";
import { InMemoryAuditLog, type AuditLog } from "./services/auditLog";
import {
  InMemoryAuditChangeWriter,
  type AuditChangeWriter,
} from "./services/auditEvents";
import {
  DailyTokenBudget,
  InMemoryAiUsageRecorder,
  type AiUsageRecorder,
} from "./services/aiUsage";
import {
  AnthropicLlmProvider,
  NoopLlmProvider,
  type LlmProvider,
} from "./services/llm";
import { InMemoryAiSettingsStore, type AiSettingsStore } from "./services/aiSettings";

const DEV_ORIGIN = "http://localhost:5173";

export type AppOptions = {
  llmProvider?: LlmProvider;
  /** Disable §9.2 rate limits (integration tests that hammer endpoints). */
  disableRateLimits?: boolean;
  /** §9.1 Access JWT verification overrides (tests inject a local key set). */
  accessJwt?: AccessJwtOptions;
  /** Override for the admin settings store (tests); default in-memory. */
  aiSettingsStore?: AiSettingsStore;
  /** Per-request store override (e.g. Neon when DATABASE_URL is bound); falls back to `aiSettingsStore`. */
  resolveAiSettingsStore?: (
    env: AppEnv["Bindings"] | undefined,
  ) => AiSettingsStore | undefined;
  /** S4 change-audit writer override (tests); default in-memory. */
  auditChangeWriter?: AuditChangeWriter;
  /** Per-request writer override (Neon audit_events when DATABASE_URL is bound). */
  resolveAuditChangeWriter?: (
    env: AppEnv["Bindings"] | undefined,
  ) => AuditChangeWriter | undefined;
  auditLog?: AuditLog;
  /** AI usage metrics recorder override (tests); default in-memory. */
  aiUsageRecorder?: AiUsageRecorder;
  /** Daily token budget override (tests inject a fixed clock). */
  tokenBudget?: DailyTokenBudget;
  /** Per-request repository override (e.g. Neon when DATABASE_URL is bound); falls back to `repository`. */
  resolveRepository?: (
    env: AppEnv["Bindings"] | undefined,
  ) => DictionaryRepository | undefined;
};

/** Compose the API with an injected repository (fixtures now, Neon later). */
export function createApp(repository: DictionaryRepository, options: AppOptions = {}) {
  const app = new Hono<AppEnv>();
  const auditLog = options.auditLog ?? new InMemoryAuditLog();
  // One store per app instance (not per request): in fixtures mode without an
  // injected/Neon store, a saved key must survive to the next request instead
  // of being written to a throwaway store and lost immediately.
  const fallbackAiSettingsStore = new InMemoryAiSettingsStore();
  const aiUsageRecorder = options.aiUsageRecorder ?? new InMemoryAiUsageRecorder();
  const tokenBudget = options.tokenBudget ?? new DailyTokenBudget();
  const defaultAuditChanges =
    options.auditChangeWriter ?? new InMemoryAuditChangeWriter();

  app.use("*", requestId());
  app.use("*", securityHeaders());
  // Pages (web) and Workers (api) run on separate origins in production —
  // allow exactly the configured web origin, nothing else (§10.1 API乱用).
  app.use(
    "/api/*",
    cors({
      origin: (origin, c) => {
        const allowed = c.env?.ALLOWED_ORIGIN ?? DEV_ORIGIN;
        return origin === allowed ? origin : null;
      },
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      maxAge: 600,
    }),
  );
  app.use("*", async (c, next) => {
    c.set("repository", options.resolveRepository?.(c.env) ?? repository);
    const aiSettingsStore =
      options.resolveAiSettingsStore?.(c.env) ??
      options.aiSettingsStore ??
      fallbackAiSettingsStore;
    c.set("aiSettingsStore", aiSettingsStore);
    c.set(
      "auditChanges",
      options.resolveAuditChangeWriter?.(c.env) ?? defaultAuditChanges,
    );
    c.set(
      "llmProvider",
      await resolveLlmProvider(c.env, aiSettingsStore, options.llmProvider),
    );
    await next();
  });
  app.use("/api/*", auditTrail(auditLog));

  if (!options.disableRateLimits) {
    // §9.2 route-group limits. Registered per group so counters don't mix;
    // exact paths (search/compare) need both the bare and wildcard forms.
    app.use("/api/v1/search", rateLimit(RATE_LIMITS.search));
    app.use("/api/v1/compare", rateLimit(RATE_LIMITS.compare));
    app.use("/api/v1/assistant/*", rateLimit(RATE_LIMITS.assistant));
    app.use("/api/v1/admin/*", rateLimit(RATE_LIMITS.admin));
  }
  // §9.1: admin routes verify the Access JWT app-side when CF_ACCESS_* are
  // bound (no-op otherwise — dev/preview keep working without Access).
  app.use("/api/v1/admin/*", accessJwt(options.accessJwt));

  app.route("/api/v1/search", searchRoutes);
  app.route("/api/v1/concepts", conceptRoutes);
  app.route("/api/v1/compare", compareRoutes);
  app.route("/api/v1/assistant", createAssistantRoutes(aiUsageRecorder, tokenBudget));
  app.route("/api/v1/admin", createAdminRoutes(aiUsageRecorder, tokenBudget));
  app.route("/api/v1/sources", sourceRoutes);
  app.route("/api/v1/export", exportRoutes);
  app.route("/api/v1/system", createSystemRoutes(auditLog));
  app.route("/api/v1/health", healthRoutes);

  app.notFound((c) => errorResponse(c, "NOT_FOUND", "リソースが見つかりません。"));
  app.onError((error, c) => {
    // Structured log without secrets/PII (§12.1): error class only — raw
    // message/stack may embed request data and stays out of logs.
    console.error(
      JSON.stringify({
        level: "error",
        service: "api",
        event: "request.failed",
        requestId: c.get("requestId") ?? "unknown",
        errorName: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return errorResponse(c, "INTERNAL_ERROR", "サーバー内部エラーが発生しました。");
  });

  return app;
}

async function resolveLlmProvider(
  env: AppEnv["Bindings"] | undefined,
  store: AiSettingsStore,
  override?: LlmProvider,
): Promise<LlmProvider> {
  if (override) return override;
  let storedKey: string | null = null;
  try {
    storedKey = await store.getKey();
  } catch {
    // Keep AI answers degrading to grounding-only instead of failing
    // unrelated routes (e.g. health) when the settings store is down.
  }
  const apiKey = env?.ANTHROPIC_API_KEY || env?.LLM_API_KEY || storedKey;
  if (!apiKey) return new NoopLlmProvider();
  return new AnthropicLlmProvider({
    apiKey,
    model: env?.ANTHROPIC_MODEL,
  });
}
