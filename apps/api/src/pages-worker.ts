/**
 * Pages advanced-mode entry (deployed as `_worker.js` with `_routes.json`
 * widened to `/*`): every request flows through here so the legacy
 * `obcda-web.pages.dev` alias can be 301-canonicalized to the Access-protected
 * custom domain. `_redirects` cannot express this — its `source` is a file
 * path by spec, so host-based rules are silently ignored.
 */

import type { ExecutionContext } from "hono";

import { app } from "./index";
import type { AppEnv } from "./middleware/context";

export const CANONICAL_HOST = "obcda.mirai-dx-platform.com";

/** Production alias hosts that must never serve content directly. */
export const LEGACY_PRODUCTION_HOSTS: ReadonlySet<string> = new Set([
  "obcda-web.pages.dev",
]);

type PagesEnv = AppEnv["Bindings"] & {
  /** Static-asset binding provided by Pages in advanced mode. */
  ASSETS: { fetch(request: Request): Promise<Response> };
};

const pagesWorker = {
  async fetch(
    request: Request,
    env: PagesEnv,
    executionCtx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (LEGACY_PRODUCTION_HOSTS.has(url.hostname)) {
      url.hostname = CANONICAL_HOST;
      url.port = "";
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, executionCtx);
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
    if (request.method !== "GET" && request.method !== "HEAD") return asset;
    // SPA fallback: client-routed paths (e.g. /search) resolve to the shell
    return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
  },
};

export default pagesWorker;
