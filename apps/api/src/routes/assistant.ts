import {
  AssistantQuestionSchema,
  SearchQuerySchema,
  type AssistantAnswer,
  type SearchResultItem,
} from "@obcda/contracts";
import { Hono } from "hono";

import type { AppEnv } from "../middleware/context";
import { errorResponse, zodDetails } from "../middleware/errors";
import {
  parseDailyTokenBudget,
  type AiUsageRecorder,
  type DailyTokenBudget,
} from "../services/aiUsage";
import { groundingOnlyAnswer } from "../services/llm";

export type AssistantAnswerResponse = {
  data: {
    answer: AssistantAnswer;
    /** Grounding shown as 根拠カード (§6.1) — search results backing the answer. */
    evidence: SearchResultItem[];
  };
  meta: { requestId: string; nextCursor: null };
};

/**
 * POST /api/v1/assistant/answers (§6): retrieve grounding via the dictionary
 * search, then delegate to the LLM provider. Claims citing unknown evidence
 * ids are rejected server-side (§6.3) — the answer degrades to
 * insufficientEvidence instead of shipping unverifiable statements.
 *
 * Cost control (AI-4 MVP): when AI_DAILY_TOKEN_BUDGET is bound and today's
 * recorded usage reaches it, the endpoint keeps serving grounding-only
 * answers (§11.3 degradation) instead of spending further tokens. Every
 * answer records a usage event (tokens/latency only — no question text).
 */
export function createAssistantRoutes(
  usageRecorder: AiUsageRecorder,
  tokenBudget: DailyTokenBudget,
) {
  const routes = new Hono<AppEnv>();

  routes.post("/answers", async (c) => {
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return errorResponse(c, "VALIDATION_ERROR", "入力内容を確認してください。", [
        { field: "(body)", reason: "invalid_json" },
      ]);
    }
    const parsed = AssistantQuestionSchema.safeParse(payload);
    if (!parsed.success) {
      return errorResponse(
        c,
        "VALIDATION_ERROR",
        "入力内容を確認してください。",
        zodDetails(parsed.error),
      );
    }

    // §6.1: the question becomes a search; retrieved items are the grounding.
    // Questions may be up to 1000 chars while search q caps at 200 — truncate
    // for retrieval instead of erroring (the provider still sees the full text).
    const query = SearchQuerySchema.parse({
      q: parsed.data.question.slice(0, 200),
      limit: "5",
    });
    const outcome = await c.get("repository").search(query);

    const providerInput = {
      question: parsed.data.question,
      explanationLevel: parsed.data.explanationLevel,
      evidence: outcome.items.map((item) => ({
        id: item.id,
        canonicalKey: item.canonicalKey,
        name: item.name,
        version: item.version,
        summaryJa: item.summaryJa,
      })),
    };

    const provider = c.get("llmProvider");
    const budgetLimit = parseDailyTokenBudget(c.env?.AI_DAILY_TOKEN_BUDGET);
    const startedAt = Date.now();
    let answer: AssistantAnswer;
    let usedTokens = { inputTokens: 0, outputTokens: 0 };
    if (tokenBudget.exhausted(budgetLimit)) {
      // §11.3 degradation, not an error: search + grounding stay available.
      answer = groundingOnlyAnswer(
        providerInput,
        "本日の AI 利用上限に達したため、AI 要約は明日まで停止しています。下記の根拠候補と原典をご確認ください。",
      );
    } else {
      try {
        const result = await provider.answer(providerInput);
        answer = result.answer;
        if (result.usage) {
          usedTokens = result.usage;
          tokenBudget.add(result.usage.inputTokens + result.usage.outputTokens);
        }
      } catch {
        return errorResponse(
          c,
          "AI_UNAVAILABLE",
          "AI 回答を生成できませんでした。検索機能は利用できます。",
        );
      }
    }

    // §6.3 guardrail: every cited evidence id must come from the grounding set.
    const allowedIds = new Set(outcome.items.map((item) => item.id));
    const hasUnknownCitation = answer.claims.some((claim) =>
      claim.evidenceIds.some((id) => !allowedIds.has(id)),
    );
    if (hasUnknownCitation) {
      // Discard the free-text answer too: prose from a provider that fabricated
      // citations is untrustworthy even with the claims stripped.
      answer = {
        answer:
          "回答に検証できない引用が含まれていたため、内容を保留しました。下記の根拠候補と原典をご確認ください。",
        explanationLevel: answer.explanationLevel,
        claims: [],
        insufficientEvidence: true,
        caveats: [
          ...answer.caveats,
          "検証できない引用が含まれていたため、主張を保留しました。",
        ],
      };
    }

    usageRecorder.record({
      occurredAt: new Date().toISOString(),
      requestId: c.get("requestId"),
      provider: provider.id,
      model: c.env?.ANTHROPIC_MODEL ?? null,
      inputTokens: usedTokens.inputTokens,
      outputTokens: usedTokens.outputTokens,
      latencyMs: Date.now() - startedAt,
      insufficientEvidence: answer.insufficientEvidence,
    });

    const body: AssistantAnswerResponse = {
      data: { answer, evidence: outcome.items },
      meta: { requestId: c.get("requestId"), nextCursor: null },
    };
    c.header("Cache-Control", "no-store");
    return c.json(body);
  });

  return routes;
}
