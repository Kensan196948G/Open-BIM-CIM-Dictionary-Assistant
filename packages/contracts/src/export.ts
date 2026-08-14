import { RELATION_TYPES } from "@obcda/domain";
import { z } from "zod";

import { ConceptDetailSchema, SourceSummarySchema } from "./concept";

/**
 * 公開辞書エクスポート（FR-308 / 詳細設計仕様書 §17 公開データエクスポート）。
 * 研究者ペルソナの中核価値: ライセンス状態フィルタ付きで公開済み概念を
 * JSON / CSV として取り出せる。CSV 応答は text/csv なので JSON 契約は
 * エクスポート概念・辞書全体の形のみを定義する（CSV は同一フィールドの
 * フラット表現）。
 */

export const DICTIONARY_EXPORT_FORMATS = ["json", "csv"] as const;
export type DictionaryExportFormat = (typeof DICTIONARY_EXPORT_FORMATS)[number];

/** GET /api/v1/export/dictionary query parameters. */
export const DictionaryExportQuerySchema = z.object({
  format: z.enum(DICTIONARY_EXPORT_FORMATS).default("json"),
  /** ライセンス状態で絞り込み（省略時は全公開概念）。 */
  license: z
    .enum(["permitted", "metadata_only", "review_required", "blocked"])
    .optional(),
});
export type DictionaryExportQuery = z.infer<typeof DictionaryExportQuerySchema>;

/** エクスポート 1 概念 = 詳細 + 関連（ターゲットは canonicalKey 参照で安定）。 */
export const DictionaryExportConceptSchema = ConceptDetailSchema.extend({
  relations: z.array(
    z.object({
      relationType: z.enum(RELATION_TYPES),
      targetCanonicalKey: z.string(),
    }),
  ),
});
export type DictionaryExportConcept = z.infer<typeof DictionaryExportConceptSchema>;

/** JSON エクスポート本体（§17.1）。 */
export const DictionaryExportSchema = z.object({
  schemaVersion: z.string(),
  exportedAt: z.iso.datetime(),
  sources: z.array(SourceSummarySchema),
  concepts: z.array(DictionaryExportConceptSchema),
});
export type DictionaryExport = z.infer<typeof DictionaryExportSchema>;
