import type { ApiErrorCode, ErrorResponse } from "@obcda/contracts";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodError } from "zod";

import type { AppEnv } from "./context";

const STATUS_BY_CODE: Record<ApiErrorCode, ContentfulStatusCode> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  SOURCE_UNAVAILABLE: 503,
  AI_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export function errorResponse(
  c: Context<AppEnv>,
  code: ApiErrorCode,
  message: string,
  details?: { field: string; reason: string }[],
) {
  const body: ErrorResponse = {
    error: {
      code,
      message,
      requestId: c.get("requestId") ?? "unknown",
      ...(details && details.length > 0 ? { details } : {}),
    },
  };
  return c.json(body, STATUS_BY_CODE[code]);
}

/** Map Zod issues to the §7.4 details shape. */
export function zodDetails(error: ZodError): { field: string; reason: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    reason: issue.message,
  }));
}
