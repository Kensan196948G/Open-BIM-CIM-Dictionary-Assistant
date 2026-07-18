import { describe, expect, it } from "vitest";

import {
  AssistantAnswerSchema,
  ErrorResponseSchema,
  SearchQuerySchema,
  SearchResultItemSchema,
} from "../src";

describe("SearchQuerySchema", () => {
  it("applies defaults and coercion for query-string input", () => {
    const parsed = SearchQuerySchema.parse({ q: "IfcAlignment" });
    expect(parsed.limit).toBe(20);
    expect(SearchQuerySchema.parse({ q: "x", limit: "50" }).limit).toBe(50);
  });

  it("rejects empty queries and out-of-range limits", () => {
    expect(SearchQuerySchema.safeParse({ q: "  " }).success).toBe(false);
    expect(SearchQuerySchema.safeParse({ q: "x", limit: "101" }).success).toBe(false);
    expect(SearchQuerySchema.safeParse({ q: "x", limit: "0" }).success).toBe(false);
  });

  it("rejects unknown families", () => {
    expect(SearchQuerySchema.safeParse({ q: "x", family: "ISO" }).success).toBe(false);
  });
});

describe("SearchResultItemSchema", () => {
  it("accepts the documented example shape (§7.3)", () => {
    const item = {
      id: "018f0000-0000-7000-8000-000000000001",
      canonicalKey: "ifc4x3:entity:IfcAlignment",
      name: "IfcAlignment",
      type: "entity",
      standardFamily: "IFC",
      version: "IFC4.3.2.0",
      summaryJa: "線形構造物の基準線形を表す概念です。",
      matchedBy: ["exact_identifier", "preferred_label"],
      score: 0.99,
    };
    expect(SearchResultItemSchema.parse(item)).toMatchObject(item);
  });

  it("requires at least one match reason and a 0..1 score", () => {
    const base = {
      id: "018f0000-0000-7000-8000-000000000001",
      canonicalKey: "k:term:x",
      name: "x",
      type: "term",
      standardFamily: "OTHER",
      version: "v1",
      summaryJa: null,
    };
    expect(
      SearchResultItemSchema.safeParse({ ...base, matchedBy: [], score: 0.5 }).success,
    ).toBe(false);
    expect(
      SearchResultItemSchema.safeParse({
        ...base,
        matchedBy: ["text"],
        score: 1.2,
      }).success,
    ).toBe(false);
  });
});

describe("ErrorResponseSchema", () => {
  it("accepts the documented error shape (§7.4)", () => {
    const body = {
      error: {
        code: "VALIDATION_ERROR",
        message: "入力内容を確認してください。",
        requestId: "0190",
        details: [{ field: "limit", reason: "must_be_between_1_and_100" }],
      },
    };
    expect(ErrorResponseSchema.parse(body)).toEqual(body);
  });

  it("rejects unknown error codes", () => {
    expect(
      ErrorResponseSchema.safeParse({
        error: { code: "BOOM", message: "x", requestId: "r" },
      }).success,
    ).toBe(false);
  });
});

describe("AssistantAnswerSchema", () => {
  it("requires every claim to cite evidence (§6.2)", () => {
    const ok = {
      answer: "IfcAlignment は線形を表します。",
      explanationLevel: "beginner",
      claims: [
        {
          text: "IfcAlignment は IFC4.3 で導入されました。",
          evidenceIds: ["018f0000-0000-7000-8000-000000000002"],
          confidence: "high",
        },
      ],
      caveats: ["仕様適合の最終判断は原典を確認してください。"],
      insufficientEvidence: false,
    };
    expect(AssistantAnswerSchema.parse(ok).claims).toHaveLength(1);

    expect(
      AssistantAnswerSchema.safeParse({
        ...ok,
        claims: [{ ...ok.claims[0], evidenceIds: [] }],
      }).success,
    ).toBe(false);
  });
});
