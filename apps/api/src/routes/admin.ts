import {
  ANTHROPIC_API_KEY_PREFIX,
  AdminChangeEventsQuerySchema,
  ReviewDecisionSchema,
  SaveAiSettingsSchema,
  TestAiSettingsSchema,
  type AdminChangeEventsResponse,
  type AiSettingsStatus,
  type AiSettingsStatusResponse,
  type AiUsageResponse,
  type ReviewDecisionResponse,
  type ReviewQueueResponse,
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
import { InMemoryReviewStore, type ReviewStore } from "../services/reviewQueue";

/** Masked key state for audit summaries — never the key itself. */
function maskedKeyState(key: string | null): Record<string, unknown> {
  return key
    ? { configured: true, maskedKey: `…${key.slice(-4)}` }
    : { configured: false };
}

/** S4: durable change audit — a failed insert must not fail the operation. */
async function recordChange(
  c: Context<AppEnv>,
  action: string,
  targetType: string,
  targetId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Promise<void> {
  try {
    await c.get("auditChanges").record({
      actor: c.get("actorEmail") ?? "anonymous",
      action,
      targetType,
      targetId,
      requestId: c.get("requestId"),
      beforeSummary: before,
      afterSummary: after,
    });
  } catch {
    // Best-effort: the change trail must not take the admin API down with it.
  }
}

/**
 * Admin AI settings (§6.4 / DEPLOYMENT §3.2: 管理系 API は Cloudflare Access
 * 必須). The key is written/cleared server-side only; GET returns just the
 * configured state and the last 4 characters — never the key itself.
 */
export function createAdminRoutes(
  usageRecorder: AiUsageRecorder,
  tokenBudget: DailyTokenBudget,
  reviewStore: ReviewStore = new InMemoryReviewStore(),
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
    const store = c.get("aiSettingsStore");
    const previousKey = await store.getKey().catch(() => null);
    await store.setKey(parsed.data.apiKey);
    await recordChange(
      c,
      "ai_settings.save",
      "ai_settings",
      "anthropic_api_key",
      maskedKeyState(previousKey),
      maskedKeyState(parsed.data.apiKey),
    );
    return statusResponse(c);
  });

  routes.delete("/ai-settings", async (c) => {
    const store = c.get("aiSettingsStore");
    const previousKey = await store.getKey().catch(() => null);
    await store.clearKey();
    await recordChange(
      c,
      "ai_settings.clear",
      "ai_settings",
      "anthropic_api_key",
      maskedKeyState(previousKey),
      maskedKeyState(null),
    );
    return statusResponse(c);
  });

  // S4: 変更監査証跡の参照（DB モードでは Neon audit_events から）
  routes.get("/change-events", async (c) => {
    const parsed = AdminChangeEventsQuerySchema.safeParse({
      limit: c.req.query("limit"),
    });
    if (!parsed.success) {
      return errorResponse(
        c,
        "VALIDATION_ERROR",
        "入力内容を確認してください。",
        zodDetails(parsed.error),
      );
    }
    const body: AdminChangeEventsResponse = {
      data: await c.get("auditChanges").list(parsed.data.limit),
      meta: { requestId: c.get("requestId"), nextCursor: null },
    };
    c.header("Cache-Control", "no-store");
    return c.json(body);
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

  // FR-303〜305: 差分レビューキュー（デモ用 — 取り込み実記録 #29 と共に実データ化）
  routes.get("/review-queue", (c) => {
    const body: ReviewQueueResponse = {
      data: reviewStore.list(),
      meta: { requestId: c.get("requestId"), nextCursor: null },
    };
    c.header("Cache-Control", "no-store");
    return c.json(body);
  });

  routes.post("/reviews/:id/decision", async (c) => {
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return errorResponse(c, "VALIDATION_ERROR", "入力内容を確認してください。", [
        { field: "(body)", reason: "invalid_json" },
      ]);
    }
    const parsed = ReviewDecisionSchema.safeParse(payload);
    if (!parsed.success) {
      return errorResponse(c, "VALIDATION_ERROR", "入力内容を確認してください。", [
        ...zodDetails(parsed.error),
      ]);
    }

    const id = c.req.param("id");
    const before = reviewStore.get(id);
    if (!before) {
      return errorResponse(c, "NOT_FOUND", "指定されたレビュー項目が見つかりません。");
    }
    const actor = c.get("actorEmail") ?? "demo-admin";
    // snapshot before deciding — decide() mutates the store entry in place
    const beforeSnapshot = {
      reviewId: before.id,
      targetKey: before.targetKey,
      status: before.status,
    };
    const after = reviewStore.decide(id, parsed.data.decision, actor);
    if (!after) {
      return errorResponse(c, "NOT_FOUND", "指定されたレビュー項目が見つかりません。");
    }

    // S4: 承認/却下は変更監査へ記録（before/after に機密情報は含まない）
    await recordChange(
      c,
      `review.${parsed.data.decision}`,
      "review_queue",
      before.id,
      beforeSnapshot,
      {
        reviewId: after.id,
        targetKey: after.targetKey,
        status: after.status,
        decidedBy: after.decidedBy,
      },
    );

    const body: ReviewDecisionResponse = {
      data: after,
      meta: { requestId: c.get("requestId"), nextCursor: null },
    };
    c.header("Cache-Control", "no-store");
    return c.json(body);
  });

  return routes;
}
