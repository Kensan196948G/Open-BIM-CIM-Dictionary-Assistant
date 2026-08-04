/**
 * Pages advanced-mode entry (deployed as `_worker.js` with `_routes.json`
 * widened to `/*`): every request flows through here so the legacy
 * `obcda-web.pages.dev` alias can be 301-canonicalized to the Access-protected
 * custom domain. `_redirects` cannot express this — its `source` is a file
 * path by spec, so host-based rules are silently ignored.
 *
 * Defence-in-depth added here (§9.1/§10.2):
 * - Admin API paths are refused on non-canonical hosts: Cloudflare Access only
 *   covers the custom domain, so per-deployment `<hash>.pages.dev` URLs would
 *   otherwise expose `/api/v1/admin/*` unauthenticated.
 * - Static-asset responses bypass the Hono `securityHeaders` middleware
 *   (they come from `env.ASSETS.fetch`), so the browser-facing security
 *   headers (CSP for the SPA document, HSTS, nosniff) are applied here.
 *   In advanced mode a `_headers` file is not evaluated, so code is the
 *   only reliable place for them.
 */

import type { ExecutionContext } from "hono";

import { app } from "./index";
import type { AppEnv } from "./middleware/context";

export const CANONICAL_HOST = "obcda.mirai-dx-platform.com";

/** Production alias hosts that must never serve content directly. */
export const LEGACY_PRODUCTION_HOSTS: ReadonlySet<string> = new Set([
  "obcda-web.pages.dev",
]);

export const ADMIN_PATH_PREFIX = "/api/v1/admin";

/** Local hosts used by `wrangler pages dev` / tests. */
const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

/**
 * SPA document CSP: no inline or third-party scripts, Google Fonts allowed for the
 * IBM Plex stylesheet, `'unsafe-inline'` limited to styles (one inline style
 * attribute exists and Tailwind may inject `<style>` in dev).
 */
const ASSET_SECURITY_HEADERS: ReadonlyArray<[string, string]> = [
  [
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  ],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains"],
];

function withAssetSecurityHeaders(response: Response): Response {
  const wrapped = new Response(response.body, response);
  for (const [name, value] of ASSET_SECURITY_HEADERS) {
    wrapped.headers.set(name, value);
  }
  return wrapped;
}

/**
 * Admin endpoints are served only on hosts covered by Cloudflare Access
 * (canonical domain), local dev hosts, and hosts deliberately allowed via
 * the ADMIN_EXTRA_HOSTS var (e.g. the preview branch host).
 */
export function isAdminHostAllowed(
  hostname: string,
  extraHosts: string | undefined,
): boolean {
  if (hostname === CANONICAL_HOST) return true;
  if (LOCAL_HOSTS.has(hostname)) return true;
  if (!extraHosts) return false;
  return extraHosts
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean)
    .includes(hostname);
}

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
      if (
        (url.pathname === ADMIN_PATH_PREFIX ||
          url.pathname.startsWith(`${ADMIN_PATH_PREFIX}/`)) &&
        !isAdminHostAllowed(url.hostname, env.ADMIN_EXTRA_HOSTS)
      ) {
        // 404 (not 403) so stray per-deployment hosts do not advertise that
        // an admin surface exists at all.
        return Response.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "リソースが見つかりません。",
              requestId: "unknown",
            },
          },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      }
      return app.fetch(request, env, executionCtx);
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return withAssetSecurityHeaders(asset);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return withAssetSecurityHeaders(asset);
    }
    // SPA fallback: client-routed paths (e.g. /search) resolve to the shell
    return withAssetSecurityHeaders(
      await env.ASSETS.fetch(new Request(new URL("/index.html", url), request)),
    );
  },
};

export default pagesWorker;
