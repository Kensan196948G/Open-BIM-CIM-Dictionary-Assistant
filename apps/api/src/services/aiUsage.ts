/**
 * AI 運用メトリクス（FR-208 の MVP・AI-4）: per-answer usage events and a
 * daily token budget, both in-memory per isolate. This is the measurement
 * layer that rate limits and cost control decisions read from; the
 * `ai_interactions` table is the Neon-backed scale-up path.
 *
 * Privacy (§12.1): events hold token counts and timing only — never the
 * question, never the answer, never an IP.
 */

import type { AiUsageEvent, AiUsageSummary } from "@obcda/contracts";

const DEFAULT_CAPACITY = 1000;

export interface AiUsageRecorder {
  record(event: AiUsageEvent): void;
  summary(): AiUsageSummary;
  recent(limit: number): AiUsageEvent[];
}

export class InMemoryAiUsageRecorder implements AiUsageRecorder {
  private readonly events: AiUsageEvent[] = [];
  private readonly windowStartedAt = new Date().toISOString();
  private totalRequests = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalLatencyMs = 0;
  private insufficientEvidenceCount = 0;

  constructor(private readonly capacity: number = DEFAULT_CAPACITY) {}

  record(event: AiUsageEvent): void {
    this.events.push(event);
    if (this.events.length > this.capacity) this.events.shift();
    this.totalRequests += 1;
    this.totalInputTokens += event.inputTokens;
    this.totalOutputTokens += event.outputTokens;
    this.totalLatencyMs += event.latencyMs;
    if (event.insufficientEvidence) this.insufficientEvidenceCount += 1;
  }

  summary(): AiUsageSummary {
    return {
      totalRequests: this.totalRequests,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      averageLatencyMs:
        this.totalRequests === 0
          ? 0
          : Math.round(this.totalLatencyMs / this.totalRequests),
      insufficientEvidenceCount: this.insufficientEvidenceCount,
      windowStartedAt: this.windowStartedAt,
    };
  }

  recent(limit: number): AiUsageEvent[] {
    return this.events.slice(-limit).reverse();
  }
}

/**
 * Daily (UTC) input+output token counter. The cap itself comes from the
 * AI_DAILY_TOKEN_BUDGET var at request time so a re-deploy isn't needed to
 * tune it; the counter survives requests within one isolate (best effort,
 * same trade-off as the rate limiter).
 */
export class DailyTokenBudget {
  private day: string;
  private used = 0;

  constructor(private readonly now: () => number = Date.now) {
    this.day = this.currentDay();
  }

  private currentDay(): string {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  private rollover(): void {
    const today = this.currentDay();
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
  }

  add(tokens: number): void {
    this.rollover();
    this.used += tokens;
  }

  usedToday(): number {
    this.rollover();
    return this.used;
  }

  exhausted(limit: number | null): boolean {
    if (limit === null || limit <= 0) return false;
    return this.usedToday() >= limit;
  }
}

/** Parse the AI_DAILY_TOKEN_BUDGET var; null = no cap. */
export function parseDailyTokenBudget(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}
