import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, exportDictionaryUrl, searchConcepts } from "../src/lib/api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("lib/api — API クライアント（Q4）", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the search query string with optional filters", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({ data: [], meta: { requestId: "r", nextCursor: null } }),
      );
    await searchConcepts({ q: "線形", family: "IFC", schema: "IFC4.3" });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "/api/v1/search?q=%E7%B7%9A%E5%BD%A2&family=IFC&schema=IFC4.3",
    );
  });

  it("maps non-OK responses to ApiError with the server error code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "入力内容を確認してください。",
            requestId: "r1",
          },
        },
        400,
      ),
    );
    const error = await searchConcepts({ q: "x" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    if (error instanceof ApiError) {
      expect(error.status).toBe(400);
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.message).toContain("入力内容を確認してください");
    }
  });

  it("keeps a safe default message when the error body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 500 }),
    );
    const error = await searchConcepts({ q: "x" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    if (error instanceof ApiError) {
      expect(error.code).toBe("INTERNAL_ERROR");
      expect(error.message).toContain("サーバーへの接続に失敗しました");
    }
  });

  it("builds export download URLs for json and csv", () => {
    expect(exportDictionaryUrl("json")).toContain(
      "/api/v1/export/dictionary?format=json",
    );
    expect(exportDictionaryUrl("csv")).toContain(
      "/api/v1/export/dictionary?format=csv",
    );
    expect(exportDictionaryUrl("json", "metadata_only")).toContain(
      "license=metadata_only",
    );
  });
});
