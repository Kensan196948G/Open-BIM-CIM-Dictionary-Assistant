import { Hono } from "hono";
import { cors } from "hono/cors";

import type { AppEnv } from "./middleware/context";
import { errorResponse } from "./middleware/errors";
import { requestId } from "./middleware/requestId";
import { securityHeaders } from "./middleware/securityHeaders";
import type { DictionaryRepository } from "./repositories/types";
import { auditTrail } from "./middleware/audit";
import { createAdminRoutes } from "./routes/admin";
import { createAssistantRoutes } from "./routes/assistant";
import { compareRoutes } from "./routes/compare";
import { conceptRoutes } from "./routes/concepts";
import { healthRoutes } from "./routes/health";
import { searchRoutes } from "./routes/search";
import { sourceRoutes } from "./routes/sources";
import { createSystemRoutes } from "./routes/system";
import { InMemoryAuditLog, type AuditLog } from "./services/auditLog";
import {
  AnthropicLlmProvider,
  NoopLlmProvider,
  type LlmProvider,
} from "./services/llm";
import { InMemoryAiSettingsStore, type AiSettingsStore } from "./services/aiSettings";

const DEV_ORIGIN = "http://localhost:5173";

export type AppOptions = {
  llmProvider?: LlmProvider;
  /** Override for the admin settings store (tests); default in-memory. */
  aiSettingsStore?: AiSettingsStore;
  /** Per-request store override (e.g. Neon when DATABASE_URL is bound); falls back to `aiSettingsStore`. */
  resolveAiSettingsStore?: (
    env: AppEnv["Bindings"] | undefined,
  ) => AiSettingsStore | undefined;
  auditLog?: AuditLog;
  /** Per-request repository override (e.g. Neon when DATABASE_URL is bound); falls back to `repository`. */
  resolveRepository?: (
    env: AppEnv["Bindings"] | undefined,
  ) => DictionaryRepository | undefined;
};

/** Compose the API with an injected repository (fixtures now, Neon later). */
export function createApp(repository: DictionaryRepository, options: AppOptions = {}) {
  const app = new Hono<AppEnv>();
  const auditLog = options.auditLog ?? new InMemoryAuditLog();

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
      new InMemoryAiSettingsStore();
    c.set("aiSettingsStore", aiSettingsStore);
    c.set(
      "llmProvider",
      await resolveLlmProvider(c.env, aiSettingsStore, options.llmProvider),
    );
    await next();
  });
  app.use("/api/*", auditTrail(auditLog));

  app.route("/api/v1/search", searchRoutes);
  app.route("/api/v1/concepts", conceptRoutes);
  app.route("/api/v1/compare", compareRoutes);
  app.route("/api/v1/assistant", createAssistantRoutes());
  app.route("/api/v1/admin", createAdminRoutes());
  app.route("/api/v1/sources", sourceRoutes);
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
  const apiKey = env?.ANTHROPIC_API_KEY ?? env?.LLM_API_KEY ?? storedKey;
  if (!apiKey) return new NoopLlmProvider();
  return new AnthropicLlmProvider({
    apiKey,
    model: env?.ANTHROPIC_MODEL,
  });
}
