import { z } from "zod";

/**
 * Grounded-answer contract per 詳細設計仕様書 §6.2.
 * Every claim must cite at least one evidence id; the API layer enforces
 * `insufficientEvidence` when grounding is missing (§6.3 guardrails).
 */
export const AssistantClaimSchema = z.object({
  text: z.string(),
  evidenceIds: z.array(z.uuid()).min(1),
  confidence: z.enum(["high", "medium", "insufficient"]),
});
export type AssistantClaim = z.infer<typeof AssistantClaimSchema>;

export const AssistantAnswerSchema = z.object({
  answer: z.string().max(5000),
  explanationLevel: z.enum(["beginner", "technical"]),
  claims: z.array(AssistantClaimSchema),
  caveats: z.array(z.string()),
  insufficientEvidence: z.boolean(),
});
export type AssistantAnswer = z.infer<typeof AssistantAnswerSchema>;

export const AssistantQuestionSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  explanationLevel: z.enum(["beginner", "technical"]).default("beginner"),
});
export type AssistantQuestion = z.infer<typeof AssistantQuestionSchema>;
