import {
  ConceptDetailResponseSchema,
  ConceptRelationsResponseSchema,
  ErrorResponseSchema,
  SearchResponseSchema,
  SourcesResponseSchema,
} from "@obcda/contracts";
import { describe, expect, it } from "vitest";

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

describe("health endpoints", () => {
  it("live and ready both report ok with fixtures loaded", async () => {
    const live = await app.request("/api/v1/health/live");
    expect(live.status).toBe(200);
    const ready = await app.request("/api/v1/health/ready");
    expect(ready.status).toBe(200);
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
