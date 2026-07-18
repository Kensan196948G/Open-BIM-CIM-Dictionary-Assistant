import { Hono } from "hono";

import type { AppEnv } from "./middleware/context";
import { errorResponse } from "./middleware/errors";
import { requestId } from "./middleware/requestId";
import { securityHeaders } from "./middleware/securityHeaders";
import type { DictionaryRepository } from "./repositories/types";
import { conceptRoutes } from "./routes/concepts";
import { healthRoutes } from "./routes/health";
import { searchRoutes } from "./routes/search";
import { sourceRoutes } from "./routes/sources";

/** Compose the API with an injected repository (fixtures now, Neon later). */
export function createApp(repository: DictionaryRepository) {
  const app = new Hono<AppEnv>();

  app.use("*", requestId());
  app.use("*", securityHeaders());
  app.use("*", async (c, next) => {
    c.set("repository", repository);
    await next();
  });

  app.route("/api/v1/search", searchRoutes);
  app.route("/api/v1/concepts", conceptRoutes);
  app.route("/api/v1/sources", sourceRoutes);
  app.route("/api/v1/health", healthRoutes);

  app.notFound((c) => errorResponse(c, "NOT_FOUND", "リソースが見つかりません。"));
  app.onError((error, c) => {
    // Structured log without secrets/PII (§12.1); stack stays server-side.
    console.error(
      JSON.stringify({
        level: "error",
        service: "api",
        event: "request.failed",
        requestId: c.get("requestId") ?? "unknown",
        message: error.message,
      }),
    );
    return errorResponse(c, "INTERNAL_ERROR", "サーバー内部エラーが発生しました。");
  });

  return app;
}
