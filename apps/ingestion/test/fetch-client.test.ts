import { describe, expect, it, vi } from "vitest";

import type { FetchContext } from "../src/adapters/types";
import { FetchGuardError, HttpStatusError, guardedFetch } from "../src/fetch/client";

const NOW = new Date("2026-07-24T00:00:00Z");

function makeCtx(
  fetchImpl: typeof fetch,
  previous?: FetchContext["previous"],
): FetchContext {
  return {
    fetchImpl,
    allowedHosts: ["example.org"],
    now: () => NOW,
    ...(previous ? { previous } : {}),
  };
}

function textResponse(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: init.headers ?? {},
  });
}

const noSleep = () => Promise.resolve();

describe("guardedFetch", () => {
  it("returns the artifact with integrity metadata and caching headers", async () => {
    const fetchImpl = vi.fn(async () =>
      textResponse('{"ok":true}', {
        headers: {
          "content-type": "application/json",
          etag: '"v1"',
          "last-modified": "Mon, 20 Jul 2026 00:00:00 GMT",
        },
      }),
    );
    const result = await guardedFetch("https://example.org/data.json", {
      ctx: makeCtx(fetchImpl as unknown as typeof fetch),
    });
    if (result.kind !== "fetched") throw new Error("expected fetched");
    expect(new TextDecoder().decode(result.artifact.bytes)).toBe('{"ok":true}');
    expect(result.artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.artifact.retrievedAt).toBe(NOW.toISOString());
    expect(result.etag).toBe('"v1"');
    expect(result.lastModified).toBe("Mon, 20 Jul 2026 00:00:00 GMT");
  });

  it("rejects non-allowlisted URLs before any network call", async () => {
    const fetchImpl = vi.fn();
    await expect(
      guardedFetch("https://evil.example.com/x", {
        ctx: makeCtx(fetchImpl as unknown as typeof fetch),
      }),
    ).rejects.toMatchObject({
      name: "FetchGuardError",
      reason: "host_not_allowlisted",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("re-guards every redirect hop", async () => {
    const fetchImpl = vi.fn(async () =>
      textResponse("", {
        status: 302,
        headers: { location: "https://attacker.test/steal" },
      }),
    );
    await expect(
      guardedFetch("https://example.org/start", {
        ctx: makeCtx(fetchImpl as unknown as typeof fetch),
      }),
    ).rejects.toMatchObject({
      name: "FetchGuardError",
      reason: "host_not_allowlisted",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops after the redirect ceiling", async () => {
    const fetchImpl = vi.fn(async (input: string | URL) =>
      textResponse("", {
        status: 302,
        headers: { location: `${String(input)}/next` },
      }),
    );
    await expect(
      guardedFetch("https://example.org/loop", {
        ctx: makeCtx(fetchImpl as unknown as typeof fetch),
      }),
    ).rejects.toMatchObject({ name: "FetchGuardError", reason: "too_many_redirects" });
    // initial request + MAX_REDIRECTS follows
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("sends conditional headers and maps 304 to not_modified", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers["if-none-match"]).toBe('"v1"');
      expect(headers["if-modified-since"]).toBe("Mon, 20 Jul 2026 00:00:00 GMT");
      return new Response(null, { status: 304 });
    });
    const result = await guardedFetch("https://example.org/data.json", {
      ctx: makeCtx(fetchImpl as unknown as typeof fetch, {
        etag: '"v1"',
        lastModified: "Mon, 20 Jul 2026 00:00:00 GMT",
      }),
    });
    expect(result).toEqual({ kind: "not_modified" });
  });

  it("skips unchanged content via the previous content hash", async () => {
    const fetchImpl = vi.fn(async () => textResponse("same-bytes"));
    const first = await guardedFetch("https://example.org/f", {
      ctx: makeCtx(fetchImpl as unknown as typeof fetch),
    });
    if (first.kind !== "fetched") throw new Error("expected fetched");
    const second = await guardedFetch("https://example.org/f", {
      ctx: makeCtx(fetchImpl as unknown as typeof fetch, {
        contentHash: first.artifact.sha256,
      }),
    });
    expect(second).toEqual({ kind: "not_modified" });
  });

  it("rejects a Content-Length / body mismatch", async () => {
    const fetchImpl = vi.fn(async () =>
      textResponse("abcdef", { headers: { "content-length": "5" } }),
    );
    await expect(
      guardedFetch("https://example.org/f", {
        ctx: makeCtx(fetchImpl as unknown as typeof fetch),
      }),
    ).rejects.toMatchObject({ name: "FetchGuardError", reason: "length_mismatch" });
  });

  it("aborts bodies that exceed the byte ceiling mid-stream", async () => {
    const fetchImpl = vi.fn(async () => textResponse("0123456789"));
    await expect(
      guardedFetch("https://example.org/big", {
        ctx: makeCtx(fetchImpl as unknown as typeof fetch),
        maxBytes: 4,
      }),
    ).rejects.toMatchObject({ name: "FetchGuardError", reason: "body_exceeds_limit" });
  });

  it("rejects declared lengths above the ceiling without reading the body", async () => {
    const fetchImpl = vi.fn(async () =>
      textResponse("irrelevant", { headers: { "content-length": "9999999" } }),
    );
    await expect(
      guardedFetch("https://example.org/big", {
        ctx: makeCtx(fetchImpl as unknown as typeof fetch),
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({
      name: "FetchGuardError",
      reason: "declared_length_exceeds_limit",
    });
  });

  it("checks magic numbers against the declared content type", async () => {
    const fetchImpl = vi.fn(async () =>
      textResponse("not a pdf", { headers: { "content-type": "application/pdf" } }),
    );
    await expect(
      guardedFetch("https://example.org/doc.pdf", {
        ctx: makeCtx(fetchImpl as unknown as typeof fetch),
      }),
    ).rejects.toMatchObject({ name: "FetchGuardError", reason: "magic_mismatch_pdf" });
  });

  it("retries 429 with backoff and then succeeds", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse("slow down", { status: 429 }))
      .mockResolvedValueOnce(textResponse("ok"));
    const result = await guardedFetch("https://example.org/rate", {
      ctx: makeCtx(fetchImpl as unknown as typeof fetch),
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      random: () => 0.5,
      backoffBaseMs: 1_000,
      backoffMaxMs: 30_000,
    });
    expect(result.kind).toBe("fetched");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([500]);
  });

  it("gives up after maxRetries transient failures", async () => {
    const fetchImpl = vi.fn(async () => textResponse("boom", { status: 503 }));
    await expect(
      guardedFetch("https://example.org/down", {
        ctx: makeCtx(fetchImpl as unknown as typeof fetch),
        maxRetries: 2,
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ name: "HttpStatusError", status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-transient statuses", async () => {
    const fetchImpl = vi.fn(async () => textResponse("gone", { status: 404 }));
    await expect(
      guardedFetch("https://example.org/missing", {
        ctx: makeCtx(fetchImpl as unknown as typeof fetch),
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ name: "HttpStatusError", status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries network failures and surfaces the original error when exhausted", async () => {
    const cause = new TypeError("fetch failed");
    const fetchImpl = vi.fn(async () => {
      throw cause;
    });
    await expect(
      guardedFetch("https://example.org/net", {
        ctx: makeCtx(fetchImpl as unknown as typeof fetch),
        maxRetries: 1,
        sleep: noSleep,
      }),
    ).rejects.toBe(cause);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("exports typed errors", () => {
    expect(new FetchGuardError("x", "https://example.org").name).toBe(
      "FetchGuardError",
    );
    expect(new HttpStatusError(500, "https://example.org").name).toBe(
      "HttpStatusError",
    );
  });
});
