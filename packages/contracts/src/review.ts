import { STANDARD_FAMILIES } from "@obcda/domain";
import { z } from "zod";

import { ResponseMetaSchema } from "./common";

/**
 * 差分レビューキュー（FR-303〜305 / 詳細設計仕様書 §4.2・§7.2 admin）。
 * 取り込み差分の人間レビューを実 API で行う。承認/却下は S4 変更監査へ記録される。
 * MVP では fixtures 由来のドラフト概念 + 架空の版更新差分をデモ用キューとして提供する。
 */

export const REVIEW_ITEM_KINDS = ["new_concept", "version_update"] as const;
export type ReviewItemKind = (typeof REVIEW_ITEM_KINDS)[number];

export const REVIEW_ITEM_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewItemStatus = (typeof REVIEW_ITEM_STATUSES)[number];

export const ReviewQueueItemSchema = z.object({
  id: z.string(),
  /** 対象概念の canonicalKey（安定参照）。 */
  targetKey: z.string(),
  name: z.string(),
  kind: z.enum(REVIEW_ITEM_KINDS),
  standardFamily: z.enum(STANDARD_FAMILIES),
  reason: z.string(),
  warnings: z.array(z.string()),
  status: z.enum(REVIEW_ITEM_STATUSES),
  decidedBy: z.string().nullable(),
  decidedAt: z.iso.datetime().nullable(),
});
export type ReviewQueueItem = z.infer<typeof ReviewQueueItemSchema>;

export const ReviewQueueResponseSchema = z.object({
  data: z.array(ReviewQueueItemSchema),
  meta: ResponseMetaSchema,
});
export type ReviewQueueResponse = z.infer<typeof ReviewQueueResponseSchema>;

export const ReviewDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

export const ReviewDecisionResponseSchema = z.object({
  data: ReviewQueueItemSchema,
  meta: ResponseMetaSchema,
});
export type ReviewDecisionResponse = z.infer<typeof ReviewDecisionResponseSchema>;
