/**
 * Guarded HTTP client per 詳細設計仕様書 §4.3 — applies the pure guard
 * functions (fetch/guard.ts) at the right points of a real download:
 *
 *   allowlist/HTTPS check → manual redirect chain (each hop re-checked)
 *   → conditional GET (ETag / Last-Modified) → declared-length check
 *   → capped body read → actual-length + magic-number check → SHA-256
 *   → content-hash skip → retry with backoff on transient failures.
 *
 * All effects (fetch, clock, sleep, randomness, rate limiter) are injected,
 * so tests exercise every branch without touching the network.
 */

import { lookup } from "node:dns/promises";

import type { FetchContext, RawArtifact } from "../adapters/types";
import {
  DEFAULT_MAX_BYTES,
  MAX_REDIRECTS,
  checkActualLength,
  checkDeclaredLength,
  checkMagicNumber,
  checkResolvedAddress,
  checkSourceUrl,
} from "./guard";
import { backoffDelayMs, realSleep, type SleepFn } from "./rate";

/** A §4.3 guard rejected the request/response — never retried. */
export class FetchGuardError extends Error {
  override readonly name = "FetchGuardError";
  constructor(
    readonly reason: string,
    readonly url: string,
  ) {
    super(`fetch guard rejected ${url}: ${reason}`);
  }
}

/** Upstream returned a non-success status (after retries, if retryable). */
export class HttpStatusError extends Error {
  override readonly name = "HttpStatusError";
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} from ${url}`);
  }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export type GuardedFetchOptions = {
  ctx: FetchContext;
  accept?: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Retries for transient failures (429/5xx/network/timeout). */
  maxRetries?: number;
  limiter?: { acquire(): Promise<void> };
  sleep?: SleepFn;
  random?: () => number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /**
   * Resolve a hostname to its A/AAAA addresses for the §10.1 resolved-address
   * guard. Defaults to node:dns lookup; injectable for tests.
   */
  resolveAddresses?: (hostname: string) => Promise<string[]>;
};

/** All A/AAAA records for the host — every one must pass the address guard. */
async function defaultResolveAddresses(hostname: string): Promise<string[]> {
  const entries = await lookup(hostname, { all: true });
  return entries.map((entry) => entry.address);
}

export type GuardedFetchResult =
  | {
      kind: "fetched";
      artifact: RawArtifact;
      etag?: string;
      lastModified?: string;
    }
  | { kind: "not_modified" };

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // copy into a plain ArrayBuffer — subtle.digest rejects SharedArrayBuffer views
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Read the body with a hard byte cap so an unbounded stream cannot exhaust memory. */
async function readBodyCapped(
  response: Response,
  maxBytes: number,
  requestUrl: string,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    // some fetch mocks expose no stream — arrayBuffer is still length-checked after
    return new Uint8Array(await response.arrayBuffer());
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FetchGuardError("body_exceeds_limit", requestUrl);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/** Release an unconsumed body so keep-alive sockets are not held open. */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // best-effort cleanup; ignore cancellation errors
  }
}

function parseDeclaredLength(response: Response): number | null {
  const header = response.headers.get("content-length");
  if (header === null || header.trim() === "") return null;
  const parsed = Number(header);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * One guarded GET. Throws FetchGuardError / HttpStatusError; returns
 * `not_modified` for 304 responses and unchanged content hashes (§4.3
 * ETag/Last-Modified/SHA-256 による不要取得削減).
 */
export async function guardedFetch(
  rawUrl: string,
  options: GuardedFetchOptions,
): Promise<GuardedFetchResult> {
  const {
    ctx,
    accept,
    timeoutMs = 30_000,
    maxBytes = DEFAULT_MAX_BYTES,
    maxRetries = 3,
    limiter,
    sleep = realSleep,
    random,
    backoffBaseMs = 1_000,
    backoffMaxMs = 30_000,
    resolveAddresses = defaultResolveAddresses,
  } = options;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchOnce();
    } catch (error) {
      const retryable =
        (error instanceof HttpStatusError && isRetryableStatus(error.status)) ||
        error instanceof TimeoutOrNetworkError;
      if (!retryable || attempt >= maxRetries) {
        if (error instanceof TimeoutOrNetworkError) throw error.cause;
        throw error;
      }
      await sleep(
        backoffDelayMs(attempt, {
          baseDelayMs: backoffBaseMs,
          maxDelayMs: backoffMaxMs,
          ...(random ? { random } : {}),
        }),
      );
    }
  }

  async function fetchOnce(): Promise<GuardedFetchResult> {
    let currentUrl = rawUrl;
    for (let redirects = 0; ; redirects += 1) {
      const verdict = checkSourceUrl(currentUrl, ctx.allowedHosts);
      if (!verdict.ok) throw new FetchGuardError(verdict.reason, currentUrl);

      // §10.1 resolved-address guard, re-resolved per request/hop. The actual
      // connection resolves again (TOCTOU window); true DNS pinning needs a
      // custom dispatcher and lands with the scale-up work (#29).
      let addresses: string[];
      try {
        addresses = await resolveAddresses(new URL(currentUrl).hostname);
      } catch (cause) {
        throw new TimeoutOrNetworkError(cause);
      }
      if (addresses.length === 0) {
        throw new TimeoutOrNetworkError(
          new Error(`dns: no addresses for ${currentUrl}`),
        );
      }
      for (const address of addresses) {
        const addressVerdict = checkResolvedAddress(address);
        if (!addressVerdict.ok) {
          throw new FetchGuardError(addressVerdict.reason, currentUrl);
        }
      }

      if (limiter) await limiter.acquire();

      const headers: Record<string, string> = {};
      if (accept) headers["accept"] = accept;
      if (ctx.previous?.etag) headers["if-none-match"] = ctx.previous.etag;
      if (ctx.previous?.lastModified) {
        headers["if-modified-since"] = ctx.previous.lastModified;
      }

      let response: Response;
      try {
        response = await ctx.fetchImpl(currentUrl, {
          method: "GET",
          headers,
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (cause) {
        throw new TimeoutOrNetworkError(cause);
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        await discardBody(response);
        const location = response.headers.get("location");
        if (!location)
          throw new FetchGuardError("redirect_without_location", currentUrl);
        if (redirects >= MAX_REDIRECTS) {
          throw new FetchGuardError("too_many_redirects", currentUrl);
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (response.status === 304) return { kind: "not_modified" };
      if (!response.ok) {
        await discardBody(response);
        throw new HttpStatusError(response.status, currentUrl);
      }

      const declaredLength = parseDeclaredLength(response);
      const declaredVerdict = checkDeclaredLength(declaredLength, maxBytes);
      if (!declaredVerdict.ok) {
        await discardBody(response);
        throw new FetchGuardError(declaredVerdict.reason, currentUrl);
      }

      const bytes = await readBodyCapped(response, maxBytes, currentUrl);
      const actualVerdict = checkActualLength(
        bytes.byteLength,
        declaredLength,
        maxBytes,
      );
      if (!actualVerdict.ok)
        throw new FetchGuardError(actualVerdict.reason, currentUrl);

      const contentType = response.headers.get("content-type") ?? "";
      const magicVerdict = checkMagicNumber(bytes, contentType);
      if (!magicVerdict.ok) throw new FetchGuardError(magicVerdict.reason, currentUrl);

      const sha256 = await sha256Hex(bytes);
      if (ctx.previous?.contentHash && ctx.previous.contentHash === sha256) {
        return { kind: "not_modified" };
      }

      return {
        kind: "fetched",
        artifact: {
          url: currentUrl,
          contentType,
          bytes,
          sha256,
          retrievedAt: ctx.now().toISOString(),
        },
        ...(response.headers.get("etag")
          ? { etag: response.headers.get("etag")! }
          : {}),
        ...(response.headers.get("last-modified")
          ? { lastModified: response.headers.get("last-modified")! }
          : {}),
      };
    }
  }
}

/** Internal marker wrapping timeout/network failures so the retry loop can identify them. */
class TimeoutOrNetworkError extends Error {
  override readonly name = "TimeoutOrNetworkError";
  constructor(override readonly cause: unknown) {
    super("transient fetch failure");
  }
}
