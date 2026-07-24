/**
 * Rate control per 詳細設計仕様書 §4.3:
 * - a minimum interval between outbound requests to one source (レート制限順守)
 * - exponential backoff with jitter for retryable failures (指数バックオフ、ジッター)
 *
 * Time and randomness are injected so tests run without real waiting.
 */

export type SleepFn = (ms: number) => Promise<void>;

export const realSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Serializes callers so consecutive acquisitions are spaced at least
 * `minIntervalMs` apart, regardless of how many run concurrently.
 */
export class MinIntervalRateLimiter {
  private nextSlotAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: SleepFn = realSleep,
  ) {}

  async acquire(): Promise<void> {
    const current = this.now();
    const scheduledAt = Math.max(current, this.nextSlotAt);
    this.nextSlotAt = scheduledAt + this.minIntervalMs;
    if (scheduledAt > current) {
      await this.sleep(scheduledAt - current);
    }
  }
}

export type BackoffOptions = {
  baseDelayMs: number;
  maxDelayMs: number;
  /** Uniform [0, 1) source — injectable for deterministic tests. */
  random?: () => number;
};

/**
 * Full-jitter exponential backoff: delay for retry `attempt` (0-based) is
 * uniformly drawn from [0, min(maxDelayMs, baseDelayMs * 2^attempt)].
 */
export function backoffDelayMs(attempt: number, options: BackoffOptions): number {
  const { baseDelayMs, maxDelayMs, random = Math.random } = options;
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.floor(random() * ceiling);
}
