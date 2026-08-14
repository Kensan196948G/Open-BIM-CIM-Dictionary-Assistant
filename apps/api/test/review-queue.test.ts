import {
  AdminChangeEventsResponseSchema,
  ReviewDecisionResponseSchema,
  ReviewQueueResponseSchema,
  ReviewQueueItemSchema,
} from "@obcda/contracts";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { dictionaryFixture } from "../src/fixtures";
import { InMemoryDictionaryRepository } from "../src/repositories/inMemory";

function freshApp() {
  return createApp(new InMemoryDictionaryRepository(dictionaryFixture));
}

async function getJson(app: ReturnType<typeof freshApp>, path: string) {
  const res = await app.request(path);
  return { res, body: await res.json() };
}

async function postJson(
  app: ReturnType<typeof freshApp>,
  path: string,
  payload: unknown,
) {
  const res = await app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { res, body: await res.json() };
}

describe("admin review queue (FR-303〜305)", () => {
  it("lists draft concepts and version updates as pending items", async () => {
    const app = freshApp();
    const { res, body } = await getJson(app, "/api/v1/admin/review-queue");
    expect(res.status).toBe(200);
    const parsed = ReviewQueueResponseSchema.parse(body);
    const items = parsed.data;
    expect(items.length).toBeGreaterThanOrEqual(4);
    // every pending draft concept from the fixture appears as a new_concept item
    const draftCount = dictionaryFixture.concepts.filter(
      (concept) => concept.status === "draft",
    ).length;
    const newItems = items.filter((item) => item.kind === "new_concept");
    expect(newItems.length).toBe(draftCount);
    expect(items.some((item) => item.kind === "version_update")).toBe(true);
    expect(items.every((item) => item.status === "pending")).toBe(true);
    expect(items.every((item) => item.decidedBy === null)).toBe(true);
  });

  it("approves an item, persists the decision and records a change-audit event", async () => {
    const app = freshApp();
    const queue = ReviewQueueResponseSchema.parse(
      (await getJson(app, "/api/v1/admin/review-queue")).body,
    ).data;
    const target = queue[0]!;

    const { res, body } = await postJson(
      app,
      `/api/v1/admin/reviews/${target.id}/decision`,
      { decision: "approved" },
    );
    expect(res.status).toBe(200);
    const parsed = ReviewDecisionResponseSchema.parse(body);
    expect(parsed.data.status).toBe("approved");
    expect(parsed.data.decidedBy).toBe("demo-admin");
    expect(parsed.data.decidedAt).not.toBeNull();

    // the queue reflects the decision
    const after = ReviewQueueResponseSchema.parse(
      (await getJson(app, "/api/v1/admin/review-queue")).body,
    ).data;
    const updated = after.find((item) => item.id === target.id);
    expect(updated?.status).toBe("approved");

    // S4: the decision lands in the change-audit trail
    const changes = AdminChangeEventsResponseSchema.parse(
      (await getJson(app, "/api/v1/admin/change-events?limit=10")).body,
    ).data;
    const reviewEvent = changes.find(
      (event) => event.targetType === "review_queue" && event.targetId === target.id,
    );
    expect(reviewEvent).toBeDefined();
    expect(reviewEvent?.action).toBe("review.approved");
    expect(reviewEvent?.beforeSummary).toMatchObject({ status: "pending" });
    expect(reviewEvent?.afterSummary).toMatchObject({ status: "approved" });
  });

  it("rejects an item with the rejected status", async () => {
    const app = freshApp();
    const queue = ReviewQueueResponseSchema.parse(
      (await getJson(app, "/api/v1/admin/review-queue")).body,
    ).data;
    const target = queue[0]!;
    const { res, body } = await postJson(
      app,
      `/api/v1/admin/reviews/${target.id}/decision`,
      { decision: "rejected" },
    );
    expect(res.status).toBe(200);
    expect(ReviewDecisionResponseSchema.parse(body).data.status).toBe("rejected");
  });

  it("404s for unknown review ids and 400s for invalid decisions", async () => {
    const app = freshApp();
    const missing = await postJson(
      app,
      "/api/v1/admin/reviews/does-not-exist/decision",
      {
        decision: "approved",
      },
    );
    expect(missing.res.status).toBe(404);

    const queue = ReviewQueueResponseSchema.parse(
      (await getJson(app, "/api/v1/admin/review-queue")).body,
    ).data;
    const invalid = await postJson(
      app,
      `/api/v1/admin/reviews/${queue[0]!.id}/decision`,
      { decision: "maybe" },
    );
    expect(invalid.res.status).toBe(400);
  });

  it("shapes every queue item as a contract-valid review item", async () => {
    const app = freshApp();
    const { body } = await getJson(app, "/api/v1/admin/review-queue");
    const parsed = ReviewQueueResponseSchema.parse(body);
    for (const item of parsed.data) {
      ReviewQueueItemSchema.parse(item);
    }
  });
});
