/**
 * LLM provider port (§6.4). The web/API layer never sees provider-specific
 * types; grounding evidence is assembled by the caller and passed in.
 *
 * MVP ships NoopLlmProvider: no LLM configured → the endpoint still honors
 * the answer contract by returning an insufficient-evidence answer plus the
 * retrieved grounding (§11.3 「LLM障害時は通常検索結果と根拠一覧のみ返却」).
 * A real provider adapter lands with Issue #14.
 */

import type { AssistantAnswer } from "@obcda/contracts";

export type GroundedEvidence = {
  /** concept id acting as the evidence id in MVP (evidence_chunks come with Neon). */
  id: string;
  canonicalKey: string;
  name: string;
  version: string;
  summaryJa: string | null;
};

export type GroundedAnswerInput = {
  question: string;
  explanationLevel: "beginner" | "technical";
  evidence: GroundedEvidence[];
};

export interface LlmProvider {
  readonly id: string;
  answer(input: GroundedAnswerInput, signal?: AbortSignal): Promise<AssistantAnswer>;
}

const STANDARD_CAVEATS = [
  "本回答は公開情報の検索・理解を支援するものであり、仕様適合・契約・設計上の判断を保証しません。",
  "実務では対象案件に適用される最新版の原典を必ず確認してください。",
];

/** Deterministic fallback provider — never fabricates claims. */
export class NoopLlmProvider implements LlmProvider {
  readonly id = "noop";

  async answer(input: GroundedAnswerInput): Promise<AssistantAnswer> {
    const hasEvidence = input.evidence.length > 0;
    return {
      answer: hasEvidence
        ? "AI による要約回答は現在利用できません。質問に関連する根拠候補を提示しますので、各項目の出典をご確認ください。"
        : "AI による要約回答は現在利用できず、質問に一致する根拠も見つかりませんでした。表記（全角/半角・略語・英語名）を変えて検索をお試しください。",
      explanationLevel: input.explanationLevel,
      claims: [],
      caveats: STANDARD_CAVEATS,
      insufficientEvidence: true,
    };
  }
}
