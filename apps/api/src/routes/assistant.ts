import {
  AssistantQuestionSchema,
  SearchQuerySchema,
  type AssistantAnswer,
  type SearchResultItem,
} from "@obcda/contracts";
import { Hono } from "hono";

import type { AppEnv } from "../middleware/context";
import { errorResponse, zodDetails } from "../middleware/errors";
import type { LlmProvider } from "../services/llm";

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
 */
export function createAssistantRoutes(provider: LlmProvider) {
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
    const query = SearchQuerySchema.parse({ q: parsed.data.question, limit: "5" });
    const outcome = await c.get("repository").search(query);

    let answer: AssistantAnswer;
    try {
      answer = await provider.answer({
        question: parsed.data.question,
        explanationLevel: parsed.data.explanationLevel,
        evidence: outcome.items.map((item) => ({
          id: item.id,
          canonicalKey: item.canonicalKey,
          name: item.name,
          version: item.version,
          summaryJa: item.summaryJa,
        })),
      });
    } catch {
      return errorResponse(
        c,
        "AI_UNAVAILABLE",
        "AI 回答を生成できませんでした。検索機能は利用できます。",
      );
    }

    // §6.3 guardrail: every cited evidence id must come from the grounding set.
    const allowedIds = new Set(outcome.items.map((item) => item.id));
    const hasUnknownCitation = answer.claims.some((claim) =>
      claim.evidenceIds.some((id) => !allowedIds.has(id)),
    );
    if (hasUnknownCitation) {
      answer = {
        ...answer,
        claims: [],
        insufficientEvidence: true,
        caveats: [
          ...answer.caveats,
          "検証できない引用が含まれていたため、主張を保留しました。",
        ],
      };
    }

    const body: AssistantAnswerResponse = {
      data: { answer, evidence: outcome.items },
      meta: { requestId: c.get("requestId"), nextCursor: null },
    };
    c.header("Cache-Control", "no-store");
    return c.json(body);
  });

  return routes;
}
