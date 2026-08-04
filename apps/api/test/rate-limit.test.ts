import { describe, expect, it } from "vitest";
import { Hono } from "hono";

import type { AppEnv } from "../src/middleware/context";
import { requestId } from "../src/middleware/requestId";
import { rateLimit } from "../src/middleware/rateLimit";
import { createApp } from "../src/app";
import { dictionaryFixture } from "../src/fixtures";
import { InMemoryDictionaryRepository } from "../src/repositories/inMemory";

function makeLimitedApp(limit: number, windowMs: number, now: () => number) {
  const app = new Hono<AppEnv>();
  app.use("*", requestId());
  app.use("/limited", rateLimit({ scope: "test", limit, windowMs, now }));
  app.get("/limited", (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit middleware (§9.2)", () => {
  it("returns 429 RATE_LIMITED with Retry-After once the window limit is hit", async () => {
    const clock = 0;
    const app = makeLimitedApp(3, 60_000, () => clock);
    for (let i = 0; i < 3; i += 1) {
      const res = await app.request("/limited");
      expect(res.status).toBe(200);
    }
    const blocked = await app.request("/limited");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");
    const body = (await blocked.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("resets the counter when the window elapses", async () => {
    let clock = 0;
    const app = makeLimitedApp(2, 60_000, () => clock);
    await app.request("/limited");
    await app.request("/limited");
    expect((await app.request("/limited")).status).toBe(429);
    clock = 60_000;
    expect((await app.request("/limited")).status).toBe(200);
  });

  it("tracks clients separately by CF-Connecting-IP", async () => {
    const app = makeLimitedApp(1, 60_000, () => 0);
    const asClient = (ip: string) =>
      app.request("/limited", { headers: { "cf-connecting-ip": ip } });
    expect((await asClient("203.0.113.1")).status).toBe(200);
    expect((await asClient("203.0.113.1")).status).toBe(429);
    // a different client is unaffected
    expect((await asClient("203.0.113.2")).status).toBe(200);
  });

  it("guards the assistant route group in the composed app", async () => {
    const app = createApp(new InMemoryDictionaryRepository(dictionaryFixture));
    const ask = () =>
      app.request("/api/v1/assistant/answers", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "198.51.100.9",
        },
        body: JSON.stringify({ question: "IfcAlignmentとは" }),
      });
    let lastStatus = 0;
    // §9.2: AI質問 10 req / 10 min — the 11th call from one client must be 429
    for (let i = 0; i < 11; i += 1) {
      lastStatus = (await ask()).status;
    }
    expect(lastStatus).toBe(429);
  });
});
