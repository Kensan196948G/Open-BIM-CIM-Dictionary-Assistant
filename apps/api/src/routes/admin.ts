import {
  ANTHROPIC_API_KEY_PREFIX,
  SaveAiSettingsSchema,
  TestAiSettingsSchema,
  type AiSettingsStatus,
  type AiSettingsStatusResponse,
  type AiUsageResponse,
  type TestAiSettingsResponse,
} from "@obcda/contracts";
import { Hono, type Context } from "hono";

import type { AppEnv } from "../middleware/context";
import { errorResponse, zodDetails } from "../middleware/errors";
import {
  parseDailyTokenBudget,
  type AiUsageRecorder,
  type DailyTokenBudget,
} from "../services/aiUsage";
import { DEFAULT_ANTHROPIC_MODEL, testAnthropicConnection } from "../services/llm";

/**
 * Admin AI settings (§6.4 / DEPLOYMENT §3.2: 管理系 API は Cloudflare Access
 * 必須). The key is written/cleared server-side only; GET returns just the
 * configured state and the last 4 characters — never the key itself.
 */
export function createAdminRoutes(
  usageRecorder: AiUsageRecorder,
  tokenBudget: DailyTokenBudget,
) {
  const routes = new Hono<AppEnv>();

  async function statusResponse(c: Context<AppEnv>) {
    const store = c.get("aiSettingsStore");
    // 空文字の env バインディングは未設定として扱う
    const envKey = c.env?.ANTHROPIC_API_KEY || c.env?.LLM_API_KEY || undefined;
    const storedKey = envKey ? null : await store.getKey();
    const activeKey = envKey ?? storedKey;
    const source = envKey ? "env" : storedKey ? "stored" : "none";
    const data: AiSettingsStatus = {
      configured: activeKey !== null,
      source,
      maskedKey: activeKey ? `…${activeKey.slice(-4)}` : null,
      model: c.env?.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
    };
    const body: AiSettingsStatusResponse = {
      data,
      meta: { requestId: c.get("requestId"), nextCursor: null },
    };
    c.header("Cache-Control", "no-store");
    return c.json(body);
  }

  routes.get("/ai-settings", (c) => statusResponse(c));

  // FR-208 MVP: AI 利用メトリクス（トークン・レイテンシのみ。質問文なし）
  routes.get("/ai-usage", (c) => {
    const dailyTokenBudget = parseDailyTokenBudget(c.env?.AI_DAILY_TOKEN_BUDGET);
    const body: AiUsageResponse = {
      data: {
        summary: usageRecorder.summary(),
        budget: {
          dailyTokenBudget,
          usedToday: tokenBudget.usedToday(),
          exhausted: tokenBudget.exhausted(dailyTokenBudget),
        },
        recent: usageRecorder.recent(20),
      },
      meta: { requestId: c.get("requestId"), nextCursor: null },
    };
    c.header("Cache-Control", "no-store");
    return c.json(body);
  });

  routes.post("/ai-settings", async (c) => {
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return errorResponse(c, "VALIDATION_ERROR", "入力内容を確認してください。", [
        { field: "(body)", reason: "invalid_json" },
      ]);
    }
    const parsed = SaveAiSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      return errorResponse(c, "VALIDATION_ERROR", "入力内容を確認してください。", [
        ...zodDetails(parsed.error),
      ]);
    }
    if (!parsed.data.apiKey.startsWith(ANTHROPIC_API_KEY_PREFIX)) {
      return errorResponse(c, "VALIDATION_ERROR", "入力内容を確認してください。", [
        {
          field: "apiKey",
          reason: "sk-ant- で始まる形式のキーを指定してください",
        },
      ]);
    }
    await c.get("aiSettingsStore").setKey(parsed.data.apiKey);
    return statusResponse(c);
  });

  routes.delete("/ai-settings", async (c) => {
    await c.get("aiSettingsStore").clearKey();
    return statusResponse(c);
  });

  routes.post("/ai-settings/test", async (c) => {
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return errorResponse(c, "VALIDATION_ERROR", "入力内容を確認してください。", [
        { field: "(body)", reason: "invalid_json" },
      ]);
    }
    const parsed = TestAiSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      return errorResponse(c, "VALIDATION_ERROR", "入力内容を確認してください。", [
        ...zodDetails(parsed.error),
      ]);
    }

    const envKey = c.env?.ANTHROPIC_API_KEY || c.env?.LLM_API_KEY || undefined;
    const apiKey =
      parsed.data.apiKey ?? envKey ?? (await c.get("aiSettingsStore").getKey());
    if (!apiKey) {
      return errorResponse(
        c,
        "AI_UNAVAILABLE",
        "APIキーが設定されていません。キーを入力してから接続テストを実行してください。",
      );
    }
    if (!apiKey.startsWith(ANTHROPIC_API_KEY_PREFIX)) {
      return errorResponse(c, "VALIDATION_ERROR", "入力内容を確認してください。", [
        {
          field: "apiKey",
          reason: "sk-ant- で始まる形式のキーを指定してください",
        },
      ]);
    }

    try {
      const model = c.env?.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
      const { latencyMs } = await testAnthropicConnection({ apiKey, model });
      const body: TestAiSettingsResponse = {
        data: { ok: true, model, latencyMs },
        meta: { requestId: c.get("requestId"), nextCursor: null },
      };
      c.header("Cache-Control", "no-store");
      return c.json(body);
    } catch {
      return errorResponse(
        c,
        "AI_UNAVAILABLE",
        "Anthropic API への接続に失敗しました。APIキーとモデル設定を確認してください。",
      );
    }
  });

  return routes;
}
