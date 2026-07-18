import { z } from "zod";

/** Error codes per 詳細設計仕様書 §7.4. */
export const API_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "SOURCE_UNAVAILABLE",
  "AI_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ErrorDetailSchema = z.object({
  field: z.string(),
  reason: z.string(),
});

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    requestId: z.string(),
    details: z.array(ErrorDetailSchema).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** Response envelope meta (§7.1: requestId correlation + cursor paging). */
export const ResponseMetaSchema = z.object({
  requestId: z.string(),
  nextCursor: z.string().nullable(),
});
export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;

/** Paging limit: 1..100, default 20 (§7.1). Coerces query-string input. */
export const LimitSchema = z.coerce.number().int().min(1).max(100).default(20);
