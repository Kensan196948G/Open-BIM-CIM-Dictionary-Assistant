/** Local dev server (Node). The web app proxies /api → this port in dev. */
import { serve } from "@hono/node-server";

import app from "./index";

const port = Number.parseInt(process.env["PORT"] ?? "8787", 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.warn(`[api] listening on http://localhost:${info.port}`);
});
