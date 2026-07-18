import { CONCEPT_TYPES, STANDARD_FAMILIES } from "@obcda/domain";
import { z } from "zod";

import { LimitSchema, ResponseMetaSchema } from "./common";

/** GET /api/v1/search query parameters (§7.3). */
export const SearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  family: z.enum(STANDARD_FAMILIES).optional(),
  type: z.enum(CONCEPT_TYPES).optional(),
  /** Version/schema filter, e.g. "IFC4.3" — alias spellings are absorbed server-side. */
  schema: z.string().trim().min(1).max(50).optional(),
  limit: LimitSchema,
  cursor: z.string().optional(),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/** Why a result matched — kept enumerable for UI display and ranking tests (§5.2). */
export const MATCH_REASONS = [
  "exact_identifier",
  "preferred_label",
  "alternative_label",
  "abbreviation",
  "text",
  "fuzzy",
] as const;
export type MatchReason = (typeof MATCH_REASONS)[number];

export const SearchResultItemSchema = z.object({
  id: z.uuid(),
  canonicalKey: z.string(),
  name: z.string(),
  type: z.enum(CONCEPT_TYPES),
  standardFamily: z.enum(STANDARD_FAMILIES),
  version: z.string(),
  summaryJa: z.string().nullable(),
  matchedBy: z.array(z.enum(MATCH_REASONS)).min(1),
  score: z.number().min(0).max(1),
});
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SearchResponseSchema = z.object({
  data: z.array(SearchResultItemSchema),
  meta: ResponseMetaSchema,
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
