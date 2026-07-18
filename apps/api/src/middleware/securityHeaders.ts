import type { MiddlewareHandler } from "hono";

/**
 * Security headers per 詳細設計仕様書 §10.2, tuned for a JSON-only API
 * (default-src 'none'; embedding forbidden).
 */
export const securityHeaders = (): MiddlewareHandler => {
  return async (c, next) => {
    await next();
    c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  };
};
