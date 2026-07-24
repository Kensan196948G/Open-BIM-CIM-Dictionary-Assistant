/** UI用ラベル辞書 — Claude Design dc プロトタイプの文言に準拠。 */

export const RELATION_GROUP_LABELS: Record<string, string> = {
  broader: "上位概念",
  narrower: "下位概念",
  related: "関連語",
  synonym: "同義語",
  confused_with: "混同しやすい語",
  inherits: "継承元",
  has_property: "属性",
  applicable_pset: "適用可能な Pset",
};

export const LABEL_TYPE_LABELS: Record<string, string> = {
  preferred: "正式名称",
  alternative: "別名",
  abbreviation: "略語",
  deprecated: "非推奨",
  translation: "訳語",
};

export const MATCH_REASON_LABELS: Record<string, string> = {
  exact_identifier: "識別子一致",
  preferred_label: "正式名称一致",
  alternative_label: "別名一致",
  abbreviation: "略語一致",
  text: "本文一致",
  fuzzy: "類似候補",
};

export function conceptStatusLabel(status: string): string {
  return status === "published" ? "✅ 公開済み" : status;
}

export function licenseStatusLabel(status: string): string {
  return status === "metadata_only" ? "メタデータのみ" : status;
}

export function formatDateTimeJa(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
}
