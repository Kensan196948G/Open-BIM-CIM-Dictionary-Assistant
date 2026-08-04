/**
 * LLM provider port (§6.4). The web/API layer never sees provider-specific
 * types; grounding evidence is assembled by the caller and passed in.
 *
 * Two providers ship here:
 * - NoopLlmProvider: no LLM key configured → the endpoint still honors the
 *   answer contract by returning an insufficient-evidence answer plus the
 *   retrieved grounding (§11.3 「LLM障害時は通常検索結果と根拠一覧のみ返却」).
 * - AnthropicLlmProvider: calls the Anthropic Messages API with the
 *   admin-managed key and the retrieved grounding; degrades to the same
 *   grounding-only answer on API/parse failures.
 */

import { AssistantAnswerSchema, type AssistantAnswer } from "@obcda/contracts";

const ANTHROPIC_API_BASE = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
/** Current default (configurable via ANTHROPIC_MODEL env). */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_REQUEST_TIMEOUT_MS = 30_000;

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

export type LlmTokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type LlmAnswerResult = {
  answer: AssistantAnswer;
  /** Provider-reported token usage; null when no billable call was made. */
  usage: LlmTokenUsage | null;
};

export interface LlmProvider {
  readonly id: string;
  answer(input: GroundedAnswerInput, signal?: AbortSignal): Promise<LlmAnswerResult>;
}

const STANDARD_CAVEATS = [
  "本回答は公開情報の検索・理解を支援するものであり、仕様適合・契約・設計上の判断を保証しません。",
  "実務では対象案件に適用される最新版の原典を必ず確認してください。",
];

/** §11.3 grounding-only fallback — never fabricates claims. */
export function groundingOnlyAnswer(
  input: GroundedAnswerInput,
  message?: string,
): AssistantAnswer {
  const hasEvidence = input.evidence.length > 0;
  return {
    answer:
      message ??
      (hasEvidence
        ? "AI による要約回答は現在利用できません。質問に関連する根拠候補を提示しますので、各項目の出典をご確認ください。"
        : "AI による要約回答は現在利用できず、質問に一致する根拠も見つかりませんでした。表記（全角/半角・略語・英語名）を変えて検索をお試しください。"),
    explanationLevel: input.explanationLevel,
    claims: [],
    caveats: STANDARD_CAVEATS,
    insufficientEvidence: true,
  };
}

/** Deterministic fallback provider — never fabricates claims. */
export class NoopLlmProvider implements LlmProvider {
  readonly id = "noop";

  async answer(input: GroundedAnswerInput): Promise<LlmAnswerResult> {
    return { answer: groundingOnlyAnswer(input), usage: null };
  }
}

export type AnthropicLlmOptions = {
  apiKey: string;
  model?: string;
  /** Per-request timeout (default 30s); testable via small values. */
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

function requestSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function systemPrompt(
  explanationLevel: GroundedAnswerInput["explanationLevel"],
): string {
  const level =
    explanationLevel === "beginner"
      ? "初心者向け：専門用語を平易な日本語で説明し、かみ砕いて答えてください。"
      : "技術者向け：専門用語をそのまま使い、正確に答えてください。";
  return [
    "あなたは openBIM/CIM 辞書アシスタントです。",
    "【最重要ルール】",
    "1. 検索で取得した「根拠（evidence）」だけを使って回答すること。根拠にない内容は一切推測・補完しない。",
    "2. 根拠が不足している場合は回答を保留し、insufficientEvidence を true にすること。",
    "3. 回答内の主要な主張は claims で必ず根拠の id を引用すること。",
    "4. 版が異なる定義を混ぜないこと。",
    `5. 説明レベル：${level}`,
    "6. 出力は JSON のみ。余計な文章やコードフェンスは付けないこと。",
    '7. 出力形式: {"answer": string, "claims": [{"text": string, "evidenceIds": [uuid], "confidence": "high"|"medium"|"insufficient"}], "insufficientEvidence": boolean, "caveats": string[]}',
  ].join("\n");
}

/** Calls the Anthropic Messages API with the given key (used by 接続テスト). */
export async function testAnthropicConnection(options: {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<{ latencyMs: number }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? ANTHROPIC_REQUEST_TIMEOUT_MS;
  const startedAt = Date.now();
  const response = await fetchImpl(ANTHROPIC_API_BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": options.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: options.model ?? DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
    signal: requestSignal(options.signal, timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Anthropic API responded with ${response.status}`);
  }
  return { latencyMs: Date.now() - startedAt };
}

function extractText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const content = (payload as { content?: unknown }).content;
  if (Array.isArray(content)) {
    const text = content.find(
      (block): block is { type: string; text?: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: string }).type === "text" &&
        typeof (block as { text?: string }).text === "string",
    );
    return text?.text ?? null;
  }
  if (typeof content === "string") return content;
  return null;
}

function extractUsage(payload: unknown): LlmTokenUsage | null {
  if (!payload || typeof payload !== "object") return null;
  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return null;
  const input = (usage as { input_tokens?: unknown }).input_tokens;
  const output = (usage as { output_tokens?: unknown }).output_tokens;
  if (typeof input !== "number" || typeof output !== "number") return null;
  return { inputTokens: input, outputTokens: output };
}

function parseAnswerJson(
  text: string,
  explanationLevel: GroundedAnswerInput["explanationLevel"],
): AssistantAnswer | null {
  // Tolerate markdown fences some models add despite the instruction.
  const withoutFences = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = AssistantAnswerSchema.parse({
      ...(JSON.parse(withoutFences.slice(start, end + 1)) as Record<string, unknown>),
      explanationLevel,
    });
    return parsed;
  } catch {
    return null;
  }
}

/** Grounded Anthropic provider — answers only from the retrieved evidence. */
export class AnthropicLlmProvider implements LlmProvider {
  readonly id = "anthropic";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AnthropicLlmOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_ANTHROPIC_MODEL;
    this.timeoutMs = options.timeoutMs ?? ANTHROPIC_REQUEST_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async answer(
    input: GroundedAnswerInput,
    signal?: AbortSignal,
  ): Promise<LlmAnswerResult> {
    if (input.evidence.length === 0) {
      return { answer: groundingOnlyAnswer(input), usage: null };
    }

    let response: Response;
    try {
      response = await this.fetchImpl(ANTHROPIC_API_BASE, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt(input.explanationLevel),
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                question: input.question,
                evidence: input.evidence,
              }),
            },
          ],
        }),
        signal: requestSignal(signal, this.timeoutMs),
      });
    } catch {
      return {
        answer: groundingOnlyAnswer(
          input,
          "AI 回答を生成できませんでした。下記の根拠候補と原典をご確認ください。",
        ),
        usage: null,
      };
    }

    if (!response.ok) {
      return {
        answer: groundingOnlyAnswer(
          input,
          "AI 回答を生成できませんでした。下記の根拠候補と原典をご確認ください。",
        ),
        usage: null,
      };
    }

    const payload = await response.json().catch(() => null);
    const usage = extractUsage(payload);
    const text = extractText(payload);
    const parsed = text ? parseAnswerJson(text, input.explanationLevel) : null;
    if (!parsed) {
      return {
        answer: groundingOnlyAnswer(
          input,
          "AI 回答の形式が不正なため保留しました。下記の根拠候補と原典をご確認ください。",
        ),
        usage,
      };
    }

    return {
      answer: {
        ...parsed,
        explanationLevel: input.explanationLevel,
        caveats: [...STANDARD_CAVEATS, ...parsed.caveats],
      },
      usage,
    };
  }
}
