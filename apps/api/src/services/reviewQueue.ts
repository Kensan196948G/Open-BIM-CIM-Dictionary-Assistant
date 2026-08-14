/**
 * 差分レビューキュー（FR-303〜305）のインメモリストア。
 * MVP: fixtures 由来のドラフト概念を「新規概念」、既存公開概念への架空の版更新を
 * 「版更新」としてデモ用にシードする。承認/却下は状態を更新し、呼び出し側
 * （admin route）が S4 変更監査へ記録する。実データは取り込みの DB 実記録
 * （Issue #29）と共に入れ替える想定。
 */

import type { ReviewQueueItem } from "@obcda/contracts";

import { dictionaryFixture } from "../fixtures";

export type ReviewStore = {
  list(): ReviewQueueItem[];
  get(id: string): ReviewQueueItem | null;
  decide(
    id: string,
    decision: "approved" | "rejected",
    actor: string,
  ): ReviewQueueItem | null;
};

/** 架空の版更新差分（デモ用）。人物・会社・実在案件データは含まない。 */
const SAMPLE_VERSION_UPDATES: Omit<
  ReviewQueueItem,
  "id" | "status" | "decidedBy" | "decidedAt"
>[] = [
  {
    targetKey: "ifc4x3:entity:IfcRoad",
    name: "IfcRoad",
    kind: "version_update",
    standardFamily: "IFC",
    reason: "summaryJa の文言差分を検出しました（取得 2026-07 → 2026-08 予定）。",
    warnings: [],
  },
  {
    targetKey: "ids1:term:IDS",
    name: "IDS",
    kind: "version_update",
    standardFamily: "IDS",
    reason: "sourceVersionId の更新を検出しました（2026-07 → 2026-11 予定）。",
    warnings: ["取得日時が未設定の版があります。"],
  },
];

export class InMemoryReviewStore implements ReviewStore {
  private readonly items: ReviewQueueItem[];

  constructor() {
    this.items = this.seed();
  }

  private seed(): ReviewQueueItem[] {
    const drafts = dictionaryFixture.concepts.filter(
      (concept) => concept.status === "draft",
    );
    const now = new Date().toISOString();
    const draftItems: ReviewQueueItem[] = drafts.map((concept, index) => ({
      id: `rq-draft-${index + 1}`,
      targetKey: concept.canonicalKey,
      name: concept.name,
      kind: "new_concept",
      standardFamily: concept.standardFamily,
      reason: `${concept.version} の取り込みで新規概念として検出されました。`,
      warnings: ["公式定義の再配布条件が未確認です。"],
      status: "pending",
      decidedBy: null,
      decidedAt: null,
    }));
    const versionItems: ReviewQueueItem[] = SAMPLE_VERSION_UPDATES.map(
      (sample, index) => ({
        ...sample,
        id: `rq-version-${index + 1}`,
        status: "pending",
        decidedBy: null,
        decidedAt: now,
      }),
    );
    return [...draftItems, ...versionItems];
  }

  list(): ReviewQueueItem[] {
    return this.items;
  }

  get(id: string): ReviewQueueItem | null {
    return this.items.find((item) => item.id === id) ?? null;
  }

  decide(
    id: string,
    decision: "approved" | "rejected",
    actor: string,
  ): ReviewQueueItem | null {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return null;
    item.status = decision;
    item.decidedBy = actor;
    item.decidedAt = new Date().toISOString();
    return item;
  }
}
