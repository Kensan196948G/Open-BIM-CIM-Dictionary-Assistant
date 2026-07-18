/** Local dev server (Node). The web app proxies /api → this port in dev. */
import { serve } from "@hono/node-server";

import app from "./index";

const rawPort = process.env["PORT"] ?? "8787";
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`Invalid PORT: ${rawPort}`);
}

serve({ fetch: app.fetch, port }, (info) => {
  console.warn(`[api] listening on http://localhost:${info.port}`);
});
