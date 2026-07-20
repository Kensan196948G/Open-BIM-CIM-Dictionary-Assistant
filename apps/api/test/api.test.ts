import {
  AssistantAnswerSchema,
  AuditEventsResponseSchema,
  CompareResponseSchema,
  ConceptDetailResponseSchema,
  ConceptRelationsResponseSchema,
  ErrorResponseSchema,
  SearchResponseSchema,
  SearchResultItemSchema,
  SourcesResponseSchema,
  SourceVersionsResponseSchema,
  SystemInfoResponseSchema,
} from "@obcda/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import app from "../src/index";

const IFC_ALIGNMENT_ID = "018f0000-0000-7000-8000-000000000001";
const UNKNOWN_ID = "018f0000-0000-7000-8000-0000000000ff";

async function getJson(path: string, init?: RequestInit) {
  const res = await app.request(path, init);
  return { res, body: await res.json() };
}

describe("GET /api/v1/search", () => {
  it("returns an exact identifier hit first for IfcAlignment", async () => {
    const { res, body } = await getJson("/api/v1/search?q=IfcAlignment");
    expect(res.status).toBe(200);
    const parsed = SearchResponseSchema.parse(body);
    expect(parsed.data[0]?.canonicalKey).toBe("ifc4x3:entity:IfcAlignment");
    expect(parsed.data[0]?.matchedBy).toContain("exact_identifier");
    expect(parsed.data[0]?.score).toBe(1);
  });

  it("finds concepts via Japanese translation labels", async () => {
    const { body } = await getJson("/api/v1/search?q=%E7%B7%9A%E5%BD%A2"); // 線形
    const parsed = SearchResponseSchema.parse(body);
    const keys = parsed.data.map((item) => item.canonicalKey);
    expect(keys).toContain("ifc4x3:entity:IfcAlignment");
    expect(keys).toContain("ifc4x3:entity:IfcAlignmentHorizontal");
  });

  it("absorbs half-width katakana input", async () => {
    // ｱﾗｲﾒﾝﾄ (half-width) should match アライメント (alternative label)
    const { body } = await getJson(
      "/api/v1/search?q=%EF%BD%B1%EF%BE%97%EF%BD%B2%EF%BE%92%EF%BE%9D%EF%BE%84",
    );
    const parsed = SearchResponseSchema.parse(body);
    expect(parsed.data.map((item) => item.canonicalKey)).toContain(
      "ifc4x3:entity:IfcAlignment",
    );
  });

  it("filters by standard family", async () => {
    const { body } = await getJson(
      "/api/v1/search?q=%E7%B7%9A%E5%BD%A2&family=MLIT_BIMCIM",
    );
    const parsed = SearchResponseSchema.parse(body);
    expect(parsed.data.every((item) => item.standardFamily === "MLIT_BIMCIM")).toBe(
      true,
    );
  });

  it("matches IFC schema filters with prefix semantics", async () => {
    // "IfcAlignment" also prefix-matches IfcAlignmentHorizontal etc. — the
    // exact hit must rank first and every hit must satisfy the schema filter.
    const hit = await getJson("/api/v1/search?q=IfcAlignment&schema=IFC4.3");
    const hitParsed = SearchResponseSchema.parse(hit.body);
    expect(hitParsed.data[0]?.canonicalKey).toBe("ifc4x3:entity:IfcAlignment");
    expect(hitParsed.data.every((item) => item.version === "IFC4.3.2.0")).toBe(true);

    const spaced = await getJson("/api/v1/search?q=IfcAlignment&schema=IFC%204.3");
    expect(SearchResponseSchema.parse(spaced.body).data[0]?.canonicalKey).toBe(
      "ifc4x3:entity:IfcAlignment",
    );

    const miss = await getJson("/api/v1/search?q=IfcAlignment&schema=IFC2x3");
    expect(SearchResponseSchema.parse(miss.body).data).toHaveLength(0);
  });

  it("tolerates small typos via fuzzy matching", async () => {
    const { body } = await getJson("/api/v1/search?q=IfcAlignmet");
    const parsed = SearchResponseSchema.parse(body);
    const first = parsed.data[0];
    expect(first?.canonicalKey).toBe("ifc4x3:entity:IfcAlignment");
    expect(first?.matchedBy).toContain("fuzzy");
  });

  it("pages with an opaque cursor and no overlap", async () => {
    const page1 = await getJson("/api/v1/search?q=Ifc&limit=2");
    const parsed1 = SearchResponseSchema.parse(page1.body);
    expect(parsed1.data).toHaveLength(2);
    expect(parsed1.meta.nextCursor).not.toBeNull();

    const page2 = await getJson(
      `/api/v1/search?q=Ifc&limit=2&cursor=${parsed1.meta.nextCursor}`,
    );
    const parsed2 = SearchResponseSchema.parse(page2.body);
    const ids1 = new Set(parsed1.data.map((item) => item.id));
    expect(parsed2.data.every((item) => !ids1.has(item.id))).toBe(true);
  });

  it("rejects invalid input with the documented error shape", async () => {
    const { res, body } = await getJson("/api/v1/search?q=x&limit=0");
    expect(res.status).toBe(400);
    const parsed = ErrorResponseSchema.parse(body);
    expect(parsed.error.code).toBe("VALIDATION_ERROR");
    expect(parsed.error.details?.some((d) => d.field === "limit")).toBe(true);
  });

  it("requires q", async () => {
    const { res } = await getJson("/api/v1/search");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/concepts/:id", () => {
  it("returns the full detail with source metadata", async () => {
    const { res, body } = await getJson(`/api/v1/concepts/${IFC_ALIGNMENT_ID}`);
    expect(res.status).toBe(200);
    const parsed = ConceptDetailResponseSchema.parse(body);
    expect(parsed.data.name).toBe("IfcAlignment");
    expect(parsed.data.source.publisher).toBe("buildingSMART International");
    expect(parsed.data.source.versionLabel).toBe("IFC4.3.2.0");
  });

  it("404s for unknown ids and 400s for malformed ids", async () => {
    const missing = await getJson(`/api/v1/concepts/${UNKNOWN_ID}`);
    expect(missing.res.status).toBe(404);
    expect(ErrorResponseSchema.parse(missing.body).error.code).toBe("NOT_FOUND");

    const malformed = await getJson("/api/v1/concepts/not-a-uuid");
    expect(malformed.res.status).toBe(400);
  });
});

describe("GET /api/v1/concepts/:id/relations", () => {
  it("resolves relation targets from the dictionary", async () => {
    const { body } = await getJson(`/api/v1/concepts/${IFC_ALIGNMENT_ID}/relations`);
    const parsed = ConceptRelationsResponseSchema.parse(body);
    expect(parsed.data.length).toBeGreaterThanOrEqual(4);
    const inherits = parsed.data.find((r) => r.relationType === "inherits");
    expect(inherits?.targetCanonicalKey).toBe(
      "ifc4x3:entity:IfcLinearPositioningElement",
    );
  });
});

describe("GET /api/v1/sources", () => {
  it("lists registered sources", async () => {
    const { body } = await getJson("/api/v1/sources");
    const parsed = SourcesResponseSchema.parse(body);
    expect(parsed.data.map((s) => s.code)).toContain("MLIT_BIMCIM_R8");
  });
});

describe("GET /api/v1/sources/:id/versions", () => {
  it("lists version labels with retrieval timestamps", async () => {
    const sources = SourcesResponseSchema.parse(
      (await getJson("/api/v1/sources")).body,
    );
    const mlit = sources.data.find((s) => s.code === "MLIT_BIMCIM_R8");
    expect(mlit).toBeDefined();

    const { res, body } = await getJson(`/api/v1/sources/${mlit?.id}/versions`);
    expect(res.status).toBe(200);
    const parsed = SourceVersionsResponseSchema.parse(body);
    expect(parsed.data.map((v) => v.versionLabel)).toContain("令和8年3月");
  });

  it("404s for unknown ids and 400s for malformed ids", async () => {
    const missing = await getJson(`/api/v1/sources/${UNKNOWN_ID}/versions`);
    expect(missing.res.status).toBe(404);
    expect(ErrorResponseSchema.parse(missing.body).error.code).toBe("NOT_FOUND");

    const malformed = await getJson("/api/v1/sources/nope/versions");
    expect(malformed.res.status).toBe(400);
  });
});

describe("health endpoints", () => {
  it("live and ready both report ok with fixtures loaded", async () => {
    const live = await app.request("/api/v1/health/live");
    expect(live.status).toBe(200);
    const ready = await app.request("/api/v1/health/ready");
    expect(ready.status).toBe(200);
  });
});

describe("REQUIRE_DATABASE fail-closed mode", () => {
  const env = { REQUIRE_DATABASE: "true" };

  it("reports not-ready instead of silently serving fixtures", async () => {
    const ready = await app.request("/api/v1/health/ready", {}, env);
    expect(ready.status).toBe(503);
    const live = await app.request("/api/v1/health/live", {}, env);
    expect(live.status).toBe(200);
  });

  it("fails data routes with the structured error contract", async () => {
    const res = await app.request("/api/v1/search?q=IfcAlignment", {}, env);
    expect(res.status).toBe(500);
    expect(ErrorResponseSchema.parse(await res.json()).error.code).toBe(
      "INTERNAL_ERROR",
    );
  });
});

describe("cross-cutting middleware", () => {
  it("echoes a well-formed X-Request-Id and sets security headers", async () => {
    const res = await app.request("/api/v1/health/live", {
      headers: { "X-Request-Id": "test-request-123" },
    });
    expect(res.headers.get("X-Request-Id")).toBe("test-request-123");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
  });

  it("generates a request id when the incoming one is malformed", async () => {
    const res = await app.request("/api/v1/health/live", {
      headers: { "X-Request-Id": "bad id with spaces!" },
    });
    const echoed = res.headers.get("X-Request-Id");
    expect(echoed).not.toBeNull();
    expect(echoed).not.toBe("bad id with spaces!");
  });

  it("returns the error contract for unknown routes", async () => {
    const { res, body } = await getJson("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(ErrorResponseSchema.parse(body).error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/v1/compare", () => {
  const HORIZONTAL_ID = "018f0000-0000-7000-8000-000000000002";

  async function postJson(path: string, body: unknown) {
    const res = await app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, body: await res.json() };
  }

  it("returns full details for 2-4 concepts", async () => {
    const { res, body } = await postJson("/api/v1/compare", {
      ids: [IFC_ALIGNMENT_ID, HORIZONTAL_ID],
    });
    expect(res.status).toBe(200);
    const parsed = CompareResponseSchema.parse(body);
    expect(parsed.data.map((d) => d.name)).toEqual([
      "IfcAlignment",
      "IfcAlignmentHorizontal",
    ]);
  });

  it("rejects fewer than 2 or more than 4 ids", async () => {
    const one = await postJson("/api/v1/compare", { ids: [IFC_ALIGNMENT_ID] });
    expect(one.res.status).toBe(400);
    const five = await postJson("/api/v1/compare", {
      ids: Array(5).fill(IFC_ALIGNMENT_ID),
    });
    expect(five.res.status).toBe(400);
  });

  it("404s with the offending index for unknown ids", async () => {
    const { res, body } = await postJson("/api/v1/compare", {
      ids: [IFC_ALIGNMENT_ID, UNKNOWN_ID],
    });
    expect(res.status).toBe(404);
    const parsed = ErrorResponseSchema.parse(body);
    expect(parsed.error.details?.[0]?.field).toBe("ids.1");
  });

  it("rejects malformed JSON bodies", async () => {
    const res = await app.request("/api/v1/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/assistant/answers", () => {
  async function ask(question: string) {
    const res = await app.request("/api/v1/assistant/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    return { res, body: (await res.json()) as never };
  }

  it("returns a contract-valid insufficient-evidence answer with grounding (no LLM configured)", async () => {
    const { res, body } = await ask("IfcAlignment とは何ですか");
    expect(res.status).toBe(200);
    const data = (body as { data: { answer: unknown; evidence: unknown[] } }).data;
    const answer = AssistantAnswerSchema.parse(data.answer);
    expect(answer.insufficientEvidence).toBe(true);
    expect(answer.claims).toHaveLength(0);
    expect(answer.caveats.length).toBeGreaterThan(0);
    const evidence = z.array(SearchResultItemSchema).parse(data.evidence);
    expect(evidence.map((e) => e.canonicalKey)).toContain("ifc4x3:entity:IfcAlignment");
  });

  it("handles zero-evidence questions without fabricating claims", async () => {
    const { res, body } = await ask("存在しない専門用語xyz987");
    expect(res.status).toBe(200);
    const data = (body as { data: { answer: unknown; evidence: unknown[] } }).data;
    const answer = AssistantAnswerSchema.parse(data.answer);
    expect(answer.insufficientEvidence).toBe(true);
    expect(data.evidence).toHaveLength(0);
  });

  it("rejects empty questions", async () => {
    const { res } = await ask("   ");
    expect(res.status).toBe(400);
  });

  it("accepts long questions by truncating the retrieval query (no 500)", async () => {
    const { res } = await ask(`IfcAlignment ${"あ".repeat(600)}`);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/system/info", () => {
  it("reports runtime facts and dictionary counts", async () => {
    const { res, body } = await getJson("/api/v1/system/info");
    expect(res.status).toBe(200);
    const parsed = SystemInfoResponseSchema.parse(body);
    expect(parsed.data.environment).toBe("fixtures");
    expect(parsed.data.llmProvider).toBe("noop");
    expect(parsed.data.counts.concepts).toBeGreaterThan(0);
    expect(parsed.data.counts.publishedConcepts).toBeLessThanOrEqual(
      parsed.data.counts.concepts,
    );
    expect(parsed.data.counts.sources).toBe(3);
  });
});

describe("GET /api/v1/system/audit-events", () => {
  it("records API requests without query strings (privacy §8.3)", async () => {
    await getJson("/api/v1/search?q=secret-search-term");
    const { res, body } = await getJson("/api/v1/system/audit-events?limit=50");
    expect(res.status).toBe(200);
    const parsed = AuditEventsResponseSchema.parse(body);
    const searchEvents = parsed.data.filter((e) => e.path === "/api/v1/search");
    expect(searchEvents.length).toBeGreaterThan(0);
    // the recorded path must never contain the query string
    expect(JSON.stringify(parsed.data)).not.toContain("secret-search-term");
    // the audit-read endpoint itself is not recorded
    expect(parsed.data.some((e) => e.path === "/api/v1/system/audit-events")).toBe(
      false,
    );
  });

  it("rejects out-of-range limits", async () => {
    const { res } = await getJson("/api/v1/system/audit-events?limit=0");
    expect(res.status).toBe(400);
    const big = await getJson("/api/v1/system/audit-events?limit=501");
    expect(big.res.status).toBe(400);
  });
});
