/**
 * Neon/Drizzle-backed DictionaryRepository (Issue #12). A shared "current
 * published version" CTE (詳細設計仕様書 §5.1: status=published, valid_from <=
 * now(), valid_to null-or-future, tie-broken by valid_from DESC) drives the
 * three version-resolving queries via raw parameterized SQL; the plain
 * Drizzle query builder covers the rest. Scoring/pagination delegates to
 * ./ranking so behavior matches InMemoryDictionaryRepository exactly.
 */

import { neon } from "@neondatabase/serverless";
import type {
  ConceptDetail,
  ConceptRelation,
  DictionaryExportConcept,
  SearchQuery,
  SourceSummary,
  SourceVersionSummary,
  TermLabel,
} from "@obcda/contracts";
import { concepts, sources, sourceVersions } from "@obcda/db";
import type {
  ConceptType,
  LicenseStatus,
  RelationType,
  StandardFamily,
} from "@obcda/domain";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import { scoreAndPaginate, type ScorableConcept, type ScorableLabel } from "./ranking";
import type { DictionaryRepository, SearchOutcome } from "./types";

const MAX_SEARCH_CANDIDATES = 5000;

/** "Current published version" per concept — the join every version-resolving query starts from. */
const CURRENT_VERSION_CTE = sql`
  current_version AS (
    SELECT DISTINCT ON (cv.concept_id)
      cv.concept_id AS "conceptId",
      cv.source_version_id AS "sourceVersionId",
      cv.official_name AS "name",
      cv.summary_ja AS "summaryJa",
      cv.official_definition AS "officialDefinition",
      cv.technical_note_ja AS "technicalNoteJa",
      cv.common_misunderstanding AS "commonMisunderstanding",
      sv.version_label AS "versionLabel",
      sv.retrieved_at AS "retrievedAt",
      s.code AS "sourceCode",
      s.publisher AS "sourcePublisher",
      s.name_ja AS "sourceNameJa",
      s.base_url AS "sourceBaseUrl",
      s.license_status AS "sourceLicenseStatus"
    FROM concept_versions cv
    JOIN source_versions sv ON sv.id = cv.source_version_id
    JOIN sources s ON s.id = sv.source_id
    WHERE cv.status = 'published'
      AND (cv.valid_from IS NULL OR cv.valid_from <= now())
      AND (cv.valid_to IS NULL OR cv.valid_to > now())
    ORDER BY cv.concept_id, cv.valid_from DESC NULLS LAST,
      sv.retrieved_at DESC, cv.id
  )
`;

export class NeonDictionaryRepository implements DictionaryRepository {
  readonly backend = "database" as const;
  private readonly db: ReturnType<typeof drizzle>;

  constructor(connectionString: string) {
    this.db = drizzle(neon(connectionString));
  }

  async search(query: SearchQuery): Promise<SearchOutcome> {
    const familyFilter = query.family
      ? sql`AND c.standard_family = ${query.family}`
      : sql``;
    const typeFilter = query.type ? sql`AND c.concept_type = ${query.type}` : sql``;

    const { rows: conceptRows } = await this.db.execute<{
      id: string;
      canonicalKey: string;
      conceptType: ConceptType;
      standardFamily: StandardFamily;
      name: string;
      summaryJa: string | null;
      versionLabel: string;
    }>(sql`
      WITH ${CURRENT_VERSION_CTE}
      SELECT
        c.id AS "id",
        c.canonical_key AS "canonicalKey",
        c.concept_type AS "conceptType",
        c.standard_family AS "standardFamily",
        cv."name" AS "name",
        cv."summaryJa" AS "summaryJa",
        cv."versionLabel" AS "versionLabel"
      FROM concepts c
      JOIN current_version cv ON cv."conceptId" = c.id
      WHERE true ${familyFilter} ${typeFilter}
      ORDER BY c.id
      LIMIT ${MAX_SEARCH_CANDIDATES}
    `);
    // Parity boundary: query.schema is matched in JS (IFC alias absorption,
    // ranking.ts) AFTER this LIMIT, so schema-filtered results are only
    // guaranteed complete up to MAX_SEARCH_CANDIDATES published concepts.
    // ORDER BY c.id keeps the truncation set deterministic until the SQL-side
    // pushdown lands (#25, with ingestion scale-up #13).

    const labelsByConceptId = await this.fetchLabelsFor(
      conceptRows.map((row) => row.id),
    );

    const candidates: ScorableConcept[] = conceptRows.map((row) => ({
      id: row.id,
      canonicalKey: row.canonicalKey,
      name: row.name,
      conceptType: row.conceptType,
      standardFamily: row.standardFamily,
      version: row.versionLabel,
      summaryJa: row.summaryJa,
      labels: labelsByConceptId.get(row.id) ?? [],
    }));

    return scoreAndPaginate(candidates, query);
  }

  async getConceptById(id: string): Promise<ConceptDetail | null> {
    const { rows } = await this.db.execute<{
      id: string;
      canonicalKey: string;
      conceptType: ConceptType;
      standardFamily: StandardFamily;
      externalUri: string | null;
      name: string;
      summaryJa: string | null;
      officialDefinition: string | null;
      technicalNoteJa: string | null;
      commonMisunderstanding: string | null;
      versionLabel: string;
      // Raw execute() bypasses Drizzle's column mapping — timestamptz arrives
      // as Postgres text, not Date (unlike the select-builder paths).
      retrievedAt: string | Date;
      sourceCode: string;
      sourcePublisher: string;
      sourceNameJa: string;
      sourceBaseUrl: string;
      sourceLicenseStatus: LicenseStatus;
    }>(sql`
      WITH ${CURRENT_VERSION_CTE}
      SELECT
        c.id AS "id",
        c.canonical_key AS "canonicalKey",
        c.concept_type AS "conceptType",
        c.standard_family AS "standardFamily",
        c.external_uri AS "externalUri",
        cv."name" AS "name",
        cv."summaryJa" AS "summaryJa",
        cv."officialDefinition" AS "officialDefinition",
        cv."technicalNoteJa" AS "technicalNoteJa",
        cv."commonMisunderstanding" AS "commonMisunderstanding",
        cv."versionLabel" AS "versionLabel",
        cv."retrievedAt" AS "retrievedAt",
        cv."sourceCode" AS "sourceCode",
        cv."sourcePublisher" AS "sourcePublisher",
        cv."sourceNameJa" AS "sourceNameJa",
        cv."sourceBaseUrl" AS "sourceBaseUrl",
        cv."sourceLicenseStatus" AS "sourceLicenseStatus"
      FROM concepts c
      JOIN current_version cv ON cv."conceptId" = c.id
      WHERE c.id = ${id}
      LIMIT 1
    `);

    const row = rows[0];
    if (!row) return null;

    const labels = await this.fetchConceptLabels(row.id);

    return {
      id: row.id,
      canonicalKey: row.canonicalKey,
      conceptType: row.conceptType,
      standardFamily: row.standardFamily,
      name: row.name,
      version: row.versionLabel,
      status: "published",
      summaryJa: row.summaryJa,
      officialDefinition: row.officialDefinition,
      technicalNoteJa: row.technicalNoteJa,
      commonMisunderstanding: row.commonMisunderstanding,
      labels,
      source: {
        sourceCode: row.sourceCode,
        publisher: row.sourcePublisher,
        documentName: row.sourceNameJa,
        versionLabel: row.versionLabel,
        url: row.sourceBaseUrl,
        licenseStatus: row.sourceLicenseStatus,
        retrievedAt: new Date(row.retrievedAt).toISOString(),
      },
      externalUri: row.externalUri,
    };
  }

  async getRelations(conceptId: string): Promise<ConceptRelation[] | null> {
    const isPublished = await this.isConceptCurrentlyPublished(conceptId);
    if (!isPublished) return null;

    // INNER JOIN to current_version silently drops relations whose target
    // isn't currently published — same behavior as InMemoryDictionaryRepository.
    const { rows } = await this.db.execute<{
      relationType: RelationType;
      targetConceptId: string;
      targetCanonicalKey: string;
      targetName: string;
      targetSummaryJa: string | null;
    }>(sql`
      WITH ${CURRENT_VERSION_CTE}
      SELECT
        cr.relation_type AS "relationType",
        tc.id AS "targetConceptId",
        tc.canonical_key AS "targetCanonicalKey",
        tcv."name" AS "targetName",
        tcv."summaryJa" AS "targetSummaryJa"
      FROM concept_relations cr
      JOIN concepts tc ON tc.id = cr.target_concept_id
      JOIN current_version tcv ON tcv."conceptId" = tc.id
      WHERE cr.source_concept_id = ${conceptId}
    `);

    return rows.map((row) => ({
      relationType: row.relationType,
      targetConceptId: row.targetConceptId,
      targetCanonicalKey: row.targetCanonicalKey,
      targetName: row.targetName,
      targetSummaryJa: row.targetSummaryJa,
    }));
  }

  async listSources(): Promise<SourceSummary[]> {
    const rows = await this.db
      .select({
        id: sources.id,
        code: sources.code,
        nameJa: sources.nameJa,
        publisher: sources.publisher,
        baseUrl: sources.baseUrl,
        sourceType: sources.sourceType,
        licenseStatus: sources.licenseStatus,
      })
      .from(sources);
    return rows;
  }

  async getSourceVersions(sourceId: string): Promise<SourceVersionSummary[] | null> {
    const sourceRows = await this.db
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.id, sourceId))
      .limit(1);
    if (sourceRows.length === 0) return null;

    const versionRows = await this.db
      .select({
        id: sourceVersions.id,
        versionLabel: sourceVersions.versionLabel,
        retrievedAt: sourceVersions.retrievedAt,
      })
      .from(sourceVersions)
      .where(eq(sourceVersions.sourceId, sourceId));

    return versionRows.map((row) => ({
      id: row.id,
      versionLabel: row.versionLabel,
      retrievedAt: row.retrievedAt.toISOString(),
    }));
  }

  async getStats(): Promise<{
    concepts: number;
    publishedConcepts: number;
    sources: number;
  }> {
    const { rows } = await this.db.execute<{
      concepts: number;
      publishedConcepts: number;
      sources: number;
    }>(sql`
      WITH ${CURRENT_VERSION_CTE}
      SELECT
        (SELECT count(*)::int FROM concepts) AS "concepts",
        (SELECT count(*)::int FROM current_version) AS "publishedConcepts",
        (SELECT count(*)::int FROM sources) AS "sources"
    `);
    return rows[0]!;
  }

  /** §17 公開辞書エクスポート（FR-308）— 全公開概念を詳細+関連付きで返す。 */
  async exportPublishedConcepts(): Promise<DictionaryExportConcept[]> {
    const { rows } = await this.db.execute<{
      id: string;
      canonicalKey: string;
      conceptType: ConceptType;
      standardFamily: StandardFamily;
      externalUri: string | null;
      name: string;
      summaryJa: string | null;
      officialDefinition: string | null;
      technicalNoteJa: string | null;
      commonMisunderstanding: string | null;
      versionLabel: string;
      retrievedAt: string | Date;
      sourceCode: string;
      sourcePublisher: string;
      sourceNameJa: string;
      sourceBaseUrl: string;
      sourceLicenseStatus: LicenseStatus;
    }>(sql`
      WITH ${CURRENT_VERSION_CTE}
      SELECT
        c.id AS "id",
        c.canonical_key AS "canonicalKey",
        c.concept_type AS "conceptType",
        c.standard_family AS "standardFamily",
        c.external_uri AS "externalUri",
        cv."name" AS "name",
        cv."summaryJa" AS "summaryJa",
        cv."officialDefinition" AS "officialDefinition",
        cv."technicalNoteJa" AS "technicalNoteJa",
        cv."commonMisunderstanding" AS "commonMisunderstanding",
        cv."versionLabel" AS "versionLabel",
        cv."retrievedAt" AS "retrievedAt",
        cv."sourceCode" AS "sourceCode",
        cv."sourcePublisher" AS "sourcePublisher",
        cv."sourceNameJa" AS "sourceNameJa",
        cv."sourceBaseUrl" AS "sourceBaseUrl",
        cv."sourceLicenseStatus" AS "sourceLicenseStatus"
      FROM concepts c
      JOIN current_version cv ON cv."conceptId" = c.id
      ORDER BY c.id
    `);
    const conceptIds = rows.map((row) => row.id);
    const labelsByConceptId = await this.fetchExportLabels(conceptIds);
    const relationsByConceptId = await this.fetchExportRelations(conceptIds);

    return rows.map((row) => ({
      id: row.id,
      canonicalKey: row.canonicalKey,
      conceptType: row.conceptType,
      standardFamily: row.standardFamily,
      name: row.name,
      version: row.versionLabel,
      status: "published" as const,
      summaryJa: row.summaryJa,
      officialDefinition: row.officialDefinition,
      technicalNoteJa: row.technicalNoteJa,
      commonMisunderstanding: row.commonMisunderstanding,
      labels: labelsByConceptId.get(row.id) ?? [],
      source: {
        sourceCode: row.sourceCode,
        publisher: row.sourcePublisher,
        documentName: row.sourceNameJa,
        versionLabel: row.versionLabel,
        url: row.sourceBaseUrl,
        licenseStatus: row.sourceLicenseStatus,
        retrievedAt: new Date(row.retrievedAt).toISOString(),
      },
      externalUri: row.externalUri,
      relations: relationsByConceptId.get(row.id) ?? [],
    }));
  }

  /** Contract: false (never throws) when the store is unreachable — used as a liveness probe. */
  async isReady(): Promise<boolean> {
    try {
      const [row] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(concepts);
      return (row?.count ?? 0) > 0;
    } catch {
      return false;
    }
  }

  // Label queries join current_version: only labels tied to the concept's
  // current published source version (or version-independent NULL rows) may
  // influence scoring/display — labels from superseded versions must not.
  private async fetchLabelsFor(
    conceptIds: string[],
  ): Promise<Map<string, ScorableLabel[]>> {
    const map = new Map<string, ScorableLabel[]>();
    if (conceptIds.length === 0) return map;

    const { rows } = await this.db.execute<{
      conceptId: string;
      label: string;
      labelType: ScorableLabel["labelType"];
    }>(sql`
      WITH ${CURRENT_VERSION_CTE}
      SELECT
        tl.concept_id AS "conceptId",
        tl.label AS "label",
        tl.label_type AS "labelType"
      FROM term_labels tl
      JOIN current_version cv ON cv."conceptId" = tl.concept_id
      WHERE ${inArray(sql`tl.concept_id`, conceptIds)}
        AND (tl.source_version_id IS NULL OR tl.source_version_id = cv."sourceVersionId")
    `);

    for (const row of rows) {
      const list = map.get(row.conceptId) ?? [];
      list.push({ label: row.label, labelType: row.labelType });
      map.set(row.conceptId, list);
    }
    return map;
  }

  private async fetchConceptLabels(conceptId: string): Promise<TermLabel[]> {
    const { rows } = await this.db.execute<TermLabel>(sql`
      WITH ${CURRENT_VERSION_CTE}
      SELECT
        tl.language AS "language",
        tl.label AS "label",
        tl.label_type AS "labelType"
      FROM term_labels tl
      JOIN current_version cv ON cv."conceptId" = tl.concept_id
      WHERE tl.concept_id = ${conceptId}
        AND (tl.source_version_id IS NULL OR tl.source_version_id = cv."sourceVersionId")
    `);
    return rows;
  }

  /** Batch variant of fetchConceptLabels for §17 export. */
  private async fetchExportLabels(
    conceptIds: string[],
  ): Promise<Map<string, TermLabel[]>> {
    const map = new Map<string, TermLabel[]>();
    if (conceptIds.length === 0) return map;
    const { rows } = await this.db.execute<TermLabel & { conceptId: string }>(sql`
      WITH ${CURRENT_VERSION_CTE}
      SELECT
        tl.concept_id AS "conceptId",
        tl.language AS "language",
        tl.label AS "label",
        tl.label_type AS "labelType"
      FROM term_labels tl
      JOIN current_version cv ON cv."conceptId" = tl.concept_id
      WHERE ${inArray(sql`tl.concept_id`, conceptIds)}
        AND (tl.source_version_id IS NULL OR tl.source_version_id = cv."sourceVersionId")
    `);
    for (const row of rows) {
      const list = map.get(row.conceptId) ?? [];
      list.push({ language: row.language, label: row.label, labelType: row.labelType });
      map.set(row.conceptId, list);
    }
    return map;
  }

  /** Relation target canonical keys for §17 export (targets must be published). */
  private async fetchExportRelations(
    conceptIds: string[],
  ): Promise<
    Map<string, { relationType: RelationType; targetCanonicalKey: string }[]>
  > {
    const map = new Map<
      string,
      { relationType: RelationType; targetCanonicalKey: string }[]
    >();
    if (conceptIds.length === 0) return map;
    const { rows } = await this.db.execute<{
      sourceConceptId: string;
      relationType: RelationType;
      targetCanonicalKey: string;
    }>(sql`
      WITH ${CURRENT_VERSION_CTE}
      SELECT
        cr.source_concept_id AS "sourceConceptId",
        cr.relation_type AS "relationType",
        tc.canonical_key AS "targetCanonicalKey"
      FROM concept_relations cr
      JOIN concepts tc ON tc.id = cr.target_concept_id
      JOIN current_version tcv ON tcv."conceptId" = tc.id
      WHERE ${inArray(sql`cr.source_concept_id`, conceptIds)}
    `);
    for (const row of rows) {
      const list = map.get(row.sourceConceptId) ?? [];
      list.push({
        relationType: row.relationType,
        targetCanonicalKey: row.targetCanonicalKey,
      });
      map.set(row.sourceConceptId, list);
    }
    return map;
  }

  private async isConceptCurrentlyPublished(conceptId: string): Promise<boolean> {
    const { rows } = await this.db.execute(sql`
      WITH ${CURRENT_VERSION_CTE}
      SELECT 1
      FROM current_version
      WHERE "conceptId" = ${conceptId}
      LIMIT 1
    `);
    return rows.length > 0;
  }
}
