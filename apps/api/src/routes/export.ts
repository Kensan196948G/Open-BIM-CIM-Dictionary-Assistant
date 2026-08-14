/**
 * §17 公開辞書エクスポート（FR-308）: JSON / CSV。
 * 公開データの読み出しのみで認証不要。ライセンス状態フィルタ付き。
 * CSV は Excel で文字化けしないよう UTF-8 BOM 付き・RFC 4180 準拠エスケープ。
 */

import { DictionaryExportQuerySchema } from "@obcda/contracts";
import type { DictionaryExportConcept } from "@obcda/contracts";
import { Hono } from "hono";

import type { AppEnv } from "../middleware/context";
import { errorResponse, zodDetails } from "../middleware/errors";

export const EXPORT_SCHEMA_VERSION = "1.0";

const CSV_HEADERS = [
  "canonicalKey",
  "name",
  "conceptType",
  "standardFamily",
  "version",
  "status",
  "summaryJa",
  "officialDefinition",
  "technicalNoteJa",
  "commonMisunderstanding",
  "labels",
  "relations",
  "sourceCode",
  "documentName",
  "sourceUrl",
  "licenseStatus",
  "retrievedAt",
  "externalUri",
] as const;

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function conceptToCsvRow(concept: DictionaryExportConcept): string[] {
  const labels = concept.labels
    .map((label) => `${label.language}:${label.labelType}:${label.label}`)
    .join("|");
  const relations = concept.relations
    .map((relation) => `${relation.relationType}:${relation.targetCanonicalKey}`)
    .join("|");
  return [
    concept.canonicalKey,
    concept.name,
    concept.conceptType,
    concept.standardFamily,
    concept.version,
    concept.status,
    concept.summaryJa ?? "",
    concept.officialDefinition ?? "",
    concept.technicalNoteJa ?? "",
    concept.commonMisunderstanding ?? "",
    labels,
    relations,
    concept.source.sourceCode,
    concept.source.documentName,
    concept.source.url,
    concept.source.licenseStatus,
    concept.source.retrievedAt,
    concept.externalUri ?? "",
  ].map((value) => csvEscape(value));
}

export const exportRoutes = new Hono<AppEnv>();

exportRoutes.get("/dictionary", async (c) => {
  const parsed = DictionaryExportQuerySchema.safeParse({
    format: c.req.query("format"),
    license: c.req.query("license"),
  });
  if (!parsed.success) {
    return errorResponse(
      c,
      "VALIDATION_ERROR",
      "入力内容を確認してください。",
      zodDetails(parsed.error),
    );
  }

  const repository = c.get("repository");
  const [sources, concepts] = await Promise.all([
    repository.listSources(),
    repository.exportPublishedConcepts(),
  ]);
  const filtered =
    parsed.data.license === undefined
      ? concepts
      : concepts.filter(
          (concept) => concept.source.licenseStatus === parsed.data.license,
        );

  c.header("Cache-Control", "no-store");
  const timestamp = new Date().toISOString();
  const baseName = `obcda-dictionary-${timestamp.slice(0, 10)}`;

  if (parsed.data.format === "csv") {
    const header = CSV_HEADERS.join(",");
    const body = [
      header,
      ...filtered.map((concept) => conceptToCsvRow(concept).join(",")),
    ].join("\r\n");
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${baseName}.csv"`);
    return c.body(`\uFEFF${body}`);
  }

  c.header("Content-Type", "application/json; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${baseName}.json"`);
  return c.json({
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: timestamp,
    sources,
    concepts: filtered,
  });
});
