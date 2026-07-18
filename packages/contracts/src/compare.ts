import { z } from "zod";

import { ResponseMetaSchema } from "./common";
import { ConceptDetailSchema } from "./concept";

/** POST /api/v1/compare — 2..4 concepts side by side (§7.2, FR-008). */
export const CompareRequestSchema = z.object({
  ids: z.array(z.uuid()).min(2).max(4),
});
export type CompareRequest = z.infer<typeof CompareRequestSchema>;

export const CompareResponseSchema = z.object({
  data: z.array(ConceptDetailSchema).min(2).max(4),
  meta: ResponseMetaSchema,
});
export type CompareResponse = z.infer<typeof CompareResponseSchema>;
