import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "./context";

const REQUEST_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Correlation id (§7.1): honor a well-formed incoming X-Request-Id, otherwise
 * generate one. Always echoed on the response.
 */
export const requestId = (): MiddlewareHandler<AppEnv> => {
  return async (c, next) => {
    const incoming = c.req.header("X-Request-Id");
    const id =
      incoming && REQUEST_ID_RE.test(incoming) ? incoming : crypto.randomUUID();
    c.set("requestId", id);
    await next();
    c.header("X-Request-Id", id);
  };
};
