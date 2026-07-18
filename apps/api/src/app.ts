import { Hono } from "hono";
import { cors } from "hono/cors";

import type { AppEnv } from "./middleware/context";
import { errorResponse } from "./middleware/errors";
import { requestId } from "./middleware/requestId";
import { securityHeaders } from "./middleware/securityHeaders";
import type { DictionaryRepository } from "./repositories/types";
import { auditTrail } from "./middleware/audit";
import { createAssistantRoutes } from "./routes/assistant";
import { compareRoutes } from "./routes/compare";
import { conceptRoutes } from "./routes/concepts";
import { healthRoutes } from "./routes/health";
import { searchRoutes } from "./routes/search";
import { sourceRoutes } from "./routes/sources";
import { createSystemRoutes } from "./routes/system";
import { InMemoryAuditLog, type AuditLog } from "./services/auditLog";
import { NoopLlmProvider, type LlmProvider } from "./services/llm";

const DEV_ORIGIN = "http://localhost:5173";

export type AppOptions = {
  llmProvider?: LlmProvider;
  auditLog?: AuditLog;
};

/** Compose the API with an injected repository (fixtures now, Neon later). */
export function createApp(repository: DictionaryRepository, options: AppOptions = {}) {
  const app = new Hono<AppEnv>();
  const llmProvider = options.llmProvider ?? new NoopLlmProvider();
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
      allowMethods: ["GET", "POST", "OPTIONS"],
      maxAge: 600,
    }),
  );
  app.use("*", async (c, next) => {
    c.set("repository", repository);
    await next();
  });
  app.use("/api/*", auditTrail(auditLog));

  app.route("/api/v1/search", searchRoutes);
  app.route("/api/v1/concepts", conceptRoutes);
  app.route("/api/v1/compare", compareRoutes);
  app.route("/api/v1/assistant", createAssistantRoutes(llmProvider));
  app.route("/api/v1/sources", sourceRoutes);
  app.route("/api/v1/system", createSystemRoutes(auditLog, llmProvider.id));
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
