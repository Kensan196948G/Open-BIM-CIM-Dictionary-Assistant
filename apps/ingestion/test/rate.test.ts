import { describe, expect, it } from "vitest";

import { MinIntervalRateLimiter, backoffDelayMs } from "../src/fetch/rate";

function fakeClock() {
  let now = 0;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleep: (ms: number) => {
      sleeps.push(ms);
      now += ms;
      return Promise.resolve();
    },
    advance: (ms: number) => {
      now += ms;
    },
    sleeps,
  };
}

describe("MinIntervalRateLimiter", () => {
  it("spaces back-to-back acquisitions by the minimum interval", async () => {
    const clock = fakeClock();
    const limiter = new MinIntervalRateLimiter(500, clock.now, clock.sleep);
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(clock.sleeps).toEqual([500, 500]);
  });

  it("does not sleep when callers are already spaced out", async () => {
    const clock = fakeClock();
    const limiter = new MinIntervalRateLimiter(500, clock.now, clock.sleep);
    await limiter.acquire();
    clock.advance(600);
    await limiter.acquire();
    expect(clock.sleeps).toEqual([]);
  });

  it("queues concurrent acquirers into consecutive slots", async () => {
    const clock = fakeClock();
    const limiter = new MinIntervalRateLimiter(500, clock.now, clock.sleep);
    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);
    // slots land at t=0/500/1000; the fake sleep advances the clock, so each
    // queued acquirer waits 500ms from the moment it is scheduled
    expect(clock.sleeps).toEqual([500, 500]);
    expect(clock.now()).toBe(1000);
  });
});

describe("backoffDelayMs", () => {
  it("grows the ceiling exponentially and honors the max", () => {
    const options = { baseDelayMs: 1_000, maxDelayMs: 30_000, random: () => 0.999 };
    expect(backoffDelayMs(0, options)).toBe(999);
    expect(backoffDelayMs(1, options)).toBe(1_998);
    expect(backoffDelayMs(10, options)).toBe(29_970);
  });

  it("draws full jitter down to zero", () => {
    expect(
      backoffDelayMs(5, { baseDelayMs: 1_000, maxDelayMs: 30_000, random: () => 0 }),
    ).toBe(0);
  });
});
