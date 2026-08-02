import {
  AiSettingsStatusResponseSchema,
  AssistantAnswerSchema,
  ErrorResponseSchema,
  SearchResultItemSchema,
  SystemInfoResponseSchema,
  TestAiSettingsResponseSchema,
} from "@obcda/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createApp } from "../src/app";
import { dictionaryFixture } from "../src/fixtures";
import { InMemoryDictionaryRepository } from "../src/repositories/inMemory";
import { InMemoryAiSettingsStore } from "../src/services/aiSettings";

const IFC_ALIGNMENT_ID = "018f0000-0000-7000-8000-000000000001";
const UNKNOWN_ID = "018f0000-0000-7000-8000-0000000000ff";
const VALID_KEY = "sk-ant-api03-abcdefghijkl";

function makeApp() {
  const repository = new InMemoryDictionaryRepository(dictionaryFixture);
  const store = new InMemoryAiSettingsStore();
  return { app: createApp(repository, { aiSettingsStore: store }), store };
}

function anthropicResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            answer: "IfcAlignment は線形構造物の基準線形を表す IFC エンティティです。",
            claims: [
              {
                text: "IfcAlignment は線形構造物の基準線形を表します。",
                evidenceIds: [IFC_ALIGNMENT_ID],
                confidence: "high",
              },
            ],
            insufficientEvidence: false,
            caveats: [],
            ...overrides,
          }),
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/v1/admin/ai-settings", () => {
  it("reports unconfigured state without exposing a key", async () => {
    const { app } = makeApp();
    const res = await app.request("/api/v1/admin/ai-settings");
    expect(res.status).toBe(200);
    const body = AiSettingsStatusResponseSchema.parse(await res.json());
    expect(body.data).toMatchObject({
      configured: false,
      source: "none",
      maskedKey: null,
    });
    expect(JSON.stringify(body)).not.toContain("sk-ant-");
  });

  it("prefers the env secret over the stored key and reports it", async () => {
    const { app, store } = makeApp();
    await store.setKey(VALID_KEY);
    const res = await app.request(
      "/api/v1/admin/ai-settings",
      {},
      { LLM_API_KEY: "sk-ant-api03-envsecret1234" },
    );
    const body = AiSettingsStatusResponseSchema.parse(await res.json());
    expect(body.data).toMatchObject({
      configured: true,
      source: "env",
      maskedKey: "…1234",
    });
  });
});

describe("POST /api/v1/admin/ai-settings", () => {
  it("persists the key and reports only a masked hint", async () => {
    const { app } = makeApp();
    const res = await app.request("/api/v1/admin/ai-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: VALID_KEY }),
    });
    expect(res.status).toBe(200);
    const body = AiSettingsStatusResponseSchema.parse(await res.json());
    expect(body.data).toMatchObject({
      configured: true,
      source: "stored",
      maskedKey: "…ijkl",
      model: "claude-sonnet-4-6",
    });

    const again = await app.request("/api/v1/admin/ai-settings");
    const againBody = AiSettingsStatusResponseSchema.parse(await again.json());
    expect(againBody.data.configured).toBe(true);
    expect(JSON.stringify(againBody)).not.toContain(VALID_KEY.slice(10));
  });

  it("rejects non-Anthropic key formats and too-short keys", async () => {
    const { app } = makeApp();
    for (const apiKey of ["wrong-format-key", "short"]) {
      const res = await app.request("/api/v1/admin/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      expect(res.status).toBe(400);
      const body = ErrorResponseSchema.parse(await res.json());
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.details?.some((d) => d.field === "apiKey")).toBe(true);
    }
  });
});

describe("DELETE /api/v1/admin/ai-settings", () => {
  it("clears the stored key", async () => {
    const { app, store } = makeApp();
    await store.setKey(VALID_KEY);
    const res = await app.request("/api/v1/admin/ai-settings", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = AiSettingsStatusResponseSchema.parse(await res.json());
    expect(body.data).toMatchObject({ configured: false, source: "none" });
    expect(await store.getKey()).toBeNull();
  });
});

describe("POST /api/v1/admin/ai-settings/test", () => {
  it("succeeds against a real Anthropic-compatible response", async () => {
    const { app, store } = makeApp();
    await store.setKey(VALID_KEY);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await app.request("/api/v1/admin/ai-settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = TestAiSettingsResponseSchema.parse(await res.json());
    expect(body.data).toMatchObject({ ok: true, model: "claude-sonnet-4-6" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      "x-api-key": VALID_KEY,
      "anthropic-version": "2023-06-01",
    });
  });

  it("returns AI_UNAVAILABLE on Anthropic errors", async () => {
    const { app, store } = makeApp();
    await store.setKey(VALID_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("invalid key", { status: 401 })),
    );
    const res = await app.request("/api/v1/admin/ai-settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(503);
    expect(ErrorResponseSchema.parse(await res.json()).error.code).toBe(
      "AI_UNAVAILABLE",
    );
  });

  it("fails without a key and without touching the network", async () => {
    const { app } = makeApp();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await app.request("/api/v1/admin/ai-settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/assistant/answers with Anthropic key", () => {
  async function ask(app: ReturnType<typeof makeApp>["app"], question: string) {
    return app.request("/api/v1/assistant/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
  }

  it("returns a grounded answer using only the retrieved evidence", async () => {
    const { app, store } = makeApp();
    await store.setKey(VALID_KEY);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(anthropicResponse()));

    const res = await ask(app, "IfcAlignment とは何ですか");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { answer: unknown; evidence: unknown[] };
    };
    const answer = AssistantAnswerSchema.parse(body.data.answer);
    expect(answer.insufficientEvidence).toBe(false);
    expect(answer.claims[0]?.evidenceIds).toEqual([IFC_ALIGNMENT_ID]);
    expect(answer.caveats.some((c) => c.startsWith("本回答は公開情報"))).toBe(true);
    const evidence = z.array(SearchResultItemSchema).parse(body.data.evidence);
    expect(evidence.map((e) => e.canonicalKey)).toContain("ifc4x3:entity:IfcAlignment");
  });

  it("rejects claims citing evidence outside the grounding set", async () => {
    const { app, store } = makeApp();
    await store.setKey(VALID_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        anthropicResponse({
          claims: [
            {
              text: "根拠外の主張",
              evidenceIds: [UNKNOWN_ID],
              confidence: "high",
            },
          ],
        }),
      ),
    );
    const res = await ask(app, "IfcAlignment とは何ですか");
    const body = (await res.json()) as {
      data: { answer: { insufficientEvidence: boolean } };
    };
    expect(res.status).toBe(200);
    expect(body.data.answer.insufficientEvidence).toBe(true);
  });

  it("degrades to a grounding-only answer when Anthropic fails (§11.3)", async () => {
    const { app, store } = makeApp();
    await store.setKey(VALID_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("boom", { status: 500 })),
    );
    const res = await ask(app, "IfcAlignment とは何ですか");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { answer: { insufficientEvidence: boolean; answer: string } };
    };
    expect(body.data.answer.insufficientEvidence).toBe(true);
    expect(body.data.answer.answer).toContain("生成できませんでした");
  });

  it("degrades on malformed model output", async () => {
    const { app, store } = makeApp();
    await store.setKey(VALID_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ content: [{ type: "text", text: "not json" }] }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );
    const res = await ask(app, "IfcAlignment とは何ですか");
    const body = (await res.json()) as {
      data: { answer: { insufficientEvidence: boolean } };
    };
    expect(res.status).toBe(200);
    expect(body.data.answer.insufficientEvidence).toBe(true);
  });

  it("does not call Anthropic when retrieval found no evidence", async () => {
    const { app, store } = makeApp();
    await store.setKey(VALID_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await ask(app, "存在しない専門用語xyz987");
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const body = (await res.json()) as {
      data: { answer: { insufficientEvidence: boolean } };
    };
    expect(body.data.answer.insufficientEvidence).toBe(true);
  });
});

describe("GET /api/v1/system/info with Anthropic key", () => {
  it("reports the anthropic provider once a key is stored", async () => {
    const { app, store } = makeApp();
    await store.setKey(VALID_KEY);
    const res = await app.request("/api/v1/system/info");
    const body = SystemInfoResponseSchema.parse(await res.json());
    expect(body.data.llmProvider).toBe("anthropic");
  });
});
