import { AiUsageResponseSchema } from "@obcda/contracts";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { dictionaryFixture } from "../src/fixtures";
import { InMemoryDictionaryRepository } from "../src/repositories/inMemory";
import {
  DailyTokenBudget,
  InMemoryAiUsageRecorder,
  parseDailyTokenBudget,
} from "../src/services/aiUsage";
import { AnthropicLlmProvider } from "../src/services/llm";

const VALID_KEY = "sk-ant-api03-abcdefghijkl";

/** Anthropic Messages API happy-path payload with usage. */
function anthropicResponse(
  answerJson: unknown,
  usage = { input_tokens: 120, output_tokens: 45 },
) {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text: JSON.stringify(answerJson) }],
      usage,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function groundedAnswerJson() {
  return {
    answer: "IfcAlignment は線形の基準を表します。",
    claims: [],
    insufficientEvidence: false,
    caveats: [],
  };
}

function makeApp(options: Parameters<typeof createApp>[1] = {}) {
  return createApp(new InMemoryDictionaryRepository(dictionaryFixture), {
    disableRateLimits: true,
    ...options,
  });
}

async function ask(app: ReturnType<typeof createApp>, env?: Record<string, string>) {
  return app.request(
    "/api/v1/assistant/answers",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "IfcAlignmentとは" }),
    },
    env,
  );
}

describe("AI usage recording (FR-208 MVP)", () => {
  it("records provider token usage per answered question", async () => {
    const recorder = new InMemoryAiUsageRecorder();
    const provider = new AnthropicLlmProvider({
      apiKey: VALID_KEY,
      fetchImpl: (async () => anthropicResponse(groundedAnswerJson())) as typeof fetch,
    });
    const app = makeApp({ aiUsageRecorder: recorder, llmProvider: provider });

    expect((await ask(app)).status).toBe(200);
    const summary = recorder.summary();
    expect(summary.totalRequests).toBe(1);
    expect(summary.totalInputTokens).toBe(120);
    expect(summary.totalOutputTokens).toBe(45);
  });

  it("records noop answers with zero tokens (task-completion metric)", async () => {
    const recorder = new InMemoryAiUsageRecorder();
    const app = makeApp({ aiUsageRecorder: recorder });
    expect((await ask(app)).status).toBe(200);
    const summary = recorder.summary();
    expect(summary.totalRequests).toBe(1);
    expect(summary.totalInputTokens).toBe(0);
    expect(summary.insufficientEvidenceCount).toBe(1);
  });

  it("never stores the question text in usage events", async () => {
    const recorder = new InMemoryAiUsageRecorder();
    const app = makeApp({ aiUsageRecorder: recorder });
    await app.request("/api/v1/assistant/answers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "secret-question-marker とは" }),
    });
    expect(JSON.stringify(recorder.recent(10))).not.toContain("secret-question-marker");
  });

  it("exposes summary/budget/recent via GET /api/v1/admin/ai-usage", async () => {
    const app = makeApp();
    await ask(app);
    const res = await app.request("/api/v1/admin/ai-usage");
    expect(res.status).toBe(200);
    const parsed = AiUsageResponseSchema.parse(await res.json());
    expect(parsed.data.summary.totalRequests).toBe(1);
    expect(parsed.data.budget.dailyTokenBudget).toBeNull();
    expect(parsed.data.recent).toHaveLength(1);
  });
});

describe("daily token budget (AI cost guard)", () => {
  it("degrades to grounding-only once the daily budget is exhausted", async () => {
    let providerCalls = 0;
    const provider = new AnthropicLlmProvider({
      apiKey: VALID_KEY,
      fetchImpl: (async () => {
        providerCalls += 1;
        return anthropicResponse(groundedAnswerJson(), {
          input_tokens: 100,
          output_tokens: 100,
        });
      }) as typeof fetch,
    });
    const app = makeApp({ llmProvider: provider });
    const env = { AI_DAILY_TOKEN_BUDGET: "150" };

    // 1st call spends 200 tokens (> 150) — allowed, then the budget is exhausted
    const first = await ask(app, env);
    expect(first.status).toBe(200);
    expect(providerCalls).toBe(1);

    const second = await ask(app, env);
    expect(second.status).toBe(200);
    const body = (await second.json()) as {
      data: { answer: { insufficientEvidence: boolean; answer: string } };
    };
    expect(providerCalls).toBe(1); // no further billable call
    expect(body.data.answer.insufficientEvidence).toBe(true);
    expect(body.data.answer.answer).toContain("上限");
  });

  it("resets on UTC day rollover", () => {
    let nowMs = Date.parse("2026-08-04T23:59:00Z");
    const budget = new DailyTokenBudget(() => nowMs);
    budget.add(500);
    expect(budget.exhausted(400)).toBe(true);
    nowMs = Date.parse("2026-08-05T00:01:00Z");
    expect(budget.usedToday()).toBe(0);
    expect(budget.exhausted(400)).toBe(false);
  });

  it("parses the budget var defensively", () => {
    expect(parseDailyTokenBudget(undefined)).toBeNull();
    expect(parseDailyTokenBudget("")).toBeNull();
    expect(parseDailyTokenBudget("abc")).toBeNull();
    expect(parseDailyTokenBudget("-5")).toBeNull();
    expect(parseDailyTokenBudget("100000")).toBe(100000);
  });
});
