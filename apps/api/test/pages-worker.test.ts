import { describe, expect, it, vi } from "vitest";

import type { ExecutionContext } from "hono";

import pagesWorker, { CANONICAL_HOST, isAdminHostAllowed } from "../src/pages-worker";

type AssetsImpl = (request: Request) => Response | Promise<Response>;

function makeEnv(
  assetsImpl: AssetsImpl = () => new Response("asset", { status: 200 }),
) {
  const assetsFetch = vi.fn(async (request: Request) => assetsImpl(request));
  const env = { ASSETS: { fetch: assetsFetch } } as unknown as Parameters<
    typeof pagesWorker.fetch
  >[1];
  return { env, assetsFetch };
}

const ctx = {} as ExecutionContext;

describe("pagesWorker (advanced-mode entry)", () => {
  it("301-redirects the legacy pages.dev alias to the canonical host, keeping path and query", async () => {
    const { env, assetsFetch } = makeEnv();
    const response = await pagesWorker.fetch(
      new Request("https://obcda-web.pages.dev/search?q=IfcAlignment"),
      env,
      ctx,
    );
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      `https://${CANONICAL_HOST}/search?q=IfcAlignment`,
    );
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it("redirects legacy API requests too — the alias never serves content", async () => {
    const { env } = makeEnv();
    const response = await pagesWorker.fetch(
      new Request("https://obcda-web.pages.dev/api/v1/health/live"),
      env,
      ctx,
    );
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      `https://${CANONICAL_HOST}/api/v1/health/live`,
    );
  });

  it("delegates /api/* on canonical and preview hosts to the Hono app", async () => {
    const { env, assetsFetch } = makeEnv();
    const response = await pagesWorker.fetch(
      new Request(`https://${CANONICAL_HOST}/api/v1/health/live`),
      env,
      ctx,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it("serves static assets through the ASSETS binding", async () => {
    const { env, assetsFetch } = makeEnv(
      () => new Response("body", { status: 200, headers: { "x-kind": "asset" } }),
    );
    const response = await pagesWorker.fetch(
      new Request(`https://${CANONICAL_HOST}/favicon.svg`),
      env,
      ctx,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-kind")).toBe("asset");
    expect(assetsFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the SPA shell for client-routed GET paths", async () => {
    const { env, assetsFetch } = makeEnv((request) =>
      new URL(request.url).pathname === "/index.html"
        ? new Response("<html>shell</html>", { status: 200 })
        : new Response("not found", { status: 404 }),
    );
    const response = await pagesWorker.fetch(
      new Request(`https://${CANONICAL_HOST}/search`),
      env,
      ctx,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("shell");
    expect(assetsFetch).toHaveBeenCalledTimes(2);
    const secondUrl = new URL(assetsFetch.mock.calls[1]![0].url);
    expect(secondUrl.pathname).toBe("/index.html");
  });

  it("does not rewrite non-GET requests to the shell", async () => {
    const { env, assetsFetch } = makeEnv(() => new Response("nope", { status: 404 }));
    const response = await pagesWorker.fetch(
      new Request(`https://${CANONICAL_HOST}/search`, { method: "POST" }),
      env,
      ctx,
    );
    expect(response.status).toBe(404);
    expect(assetsFetch).toHaveBeenCalledTimes(1);
  });

  it("applies security headers (CSP/HSTS/nosniff) to static-asset responses", async () => {
    const { env } = makeEnv(() => new Response("<html>shell</html>", { status: 200 }));
    const response = await pagesWorker.fetch(
      new Request(`https://${CANONICAL_HOST}/`),
      env,
      ctx,
    );
    expect(response.status).toBe(200);
    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=");
  });

  it("refuses /api/v1/admin/* on per-deployment pages.dev hosts with 404", async () => {
    const { env, assetsFetch } = makeEnv();
    const response = await pagesWorker.fetch(
      new Request("https://abc12345.obcda-web.pages.dev/api/v1/admin/ai-settings"),
      env,
      ctx,
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it("still serves admin endpoints on the canonical host", async () => {
    const { env } = makeEnv();
    const response = await pagesWorker.fetch(
      new Request(`https://${CANONICAL_HOST}/api/v1/admin/ai-settings`),
      env,
      ctx,
    );
    expect(response.status).toBe(200);
  });

  it("keeps non-admin API routes reachable on non-canonical hosts", async () => {
    const { env } = makeEnv();
    const response = await pagesWorker.fetch(
      new Request("https://abc12345.obcda-web.pages.dev/api/v1/health/live"),
      env,
      ctx,
    );
    expect(response.status).toBe(200);
  });

  it("allows extra admin hosts only via ADMIN_EXTRA_HOSTS", () => {
    expect(isAdminHostAllowed(CANONICAL_HOST, undefined)).toBe(true);
    expect(isAdminHostAllowed("localhost", undefined)).toBe(true);
    expect(isAdminHostAllowed("preview.obcda-web.pages.dev", undefined)).toBe(false);
    expect(
      isAdminHostAllowed(
        "preview.obcda-web.pages.dev",
        "preview.obcda-web.pages.dev, other.example.com",
      ),
    ).toBe(true);
    expect(isAdminHostAllowed("evil.example.com", "preview.obcda-web.pages.dev")).toBe(
      false,
    );
  });
});
