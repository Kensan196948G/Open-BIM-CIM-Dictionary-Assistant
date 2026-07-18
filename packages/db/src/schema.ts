/**
 * Drizzle schema mirroring migrations/0001_init.sql (詳細設計仕様書 §3.2/§3.3).
 * The SQL migration is the DDL source of truth; this schema provides typed
 * query building for the API/ingestion apps. Keep both in sync when changing
 * either (a drizzle-kit drift check is planned in CI — Issue #4).
 */

import {
  ATTRIBUTE_KINDS,
  CONCEPT_TYPES,
  CONCEPT_VERSION_STATUSES,
  DEPRECATION_STATES,
  IFC_MEMBER_KINDS,
  LABEL_TYPES,
  LICENSE_STATUSES,
  LOCATOR_TYPES,
  RELATION_REVIEW_STATUSES,
  RELATION_TYPES,
  SOURCE_TYPES,
  SOURCE_VERSION_STATUSES,
  STANDARD_FAMILIES,
  TRUST_LEVELS,
} from "@obcda/domain";
import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// custom column types
// ---------------------------------------------------------------------------

/** tsvector column — value is DB-generated (GENERATED ALWAYS AS in SQL); never written by the app. */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/** pgvector column — dimension is fixed in SQL once the embedding model is chosen (§3.2). */
const pgvector = customType<{ data: number[] }>({
  dataType() {
    return "vector";
  },
});

// ---------------------------------------------------------------------------
// enums
// ---------------------------------------------------------------------------

export const sourceTypeEnum = pgEnum("source_type", SOURCE_TYPES);
export const licenseStatusEnum = pgEnum("license_status", LICENSE_STATUSES);
export const sourceVersionStatusEnum = pgEnum(
  "source_version_status",
  SOURCE_VERSION_STATUSES,
);
export const conceptTypeEnum = pgEnum("concept_type", CONCEPT_TYPES);
export const standardFamilyEnum = pgEnum("standard_family", STANDARD_FAMILIES);
export const conceptVersionStatusEnum = pgEnum(
  "concept_version_status",
  CONCEPT_VERSION_STATUSES,
);
export const labelTypeEnum = pgEnum("label_type", LABEL_TYPES);
export const relationTypeEnum = pgEnum("relation_type", RELATION_TYPES);
export const relationReviewStatusEnum = pgEnum(
  "relation_review_status",
  RELATION_REVIEW_STATUSES,
);
export const ifcMemberKindEnum = pgEnum("ifc_member_kind", IFC_MEMBER_KINDS);
export const attributeKindEnum = pgEnum("attribute_kind", ATTRIBUTE_KINDS);
export const deprecationStateEnum = pgEnum("deprecation_state", DEPRECATION_STATES);
export const trustLevelEnum = pgEnum("trust_level", TRUST_LEVELS);
export const locatorTypeEnum = pgEnum("locator_type", LOCATOR_TYPES);
export const ingestionRunStatusEnum = pgEnum("ingestion_run_status", [
  "running",
  "succeeded",
  "partial",
  "failed",
]);
export const ingestionItemStatusEnum = pgEnum("ingestion_item_status", [
  "discovered",
  "fetched",
  "parsed",
  "normalized",
  "validated",
  "review",
  "published",
  "unchanged",
  "rejected",
  "failed",
]);
export const reviewDecisionEnum = pgEnum("review_decision", [
  "pending",
  "approved",
  "rejected",
]);

// ---------------------------------------------------------------------------
// core tables (§3.2)
// ---------------------------------------------------------------------------

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 80 }).notNull().unique(),
  nameJa: text("name_ja").notNull(),
  publisher: text("publisher").notNull(),
  baseUrl: text("base_url").notNull(),
  sourceType: sourceTypeEnum("source_type").notNull(),
  licenseStatus: licenseStatusEnum("license_status").notNull(),
  licenseUrl: text("license_url"),
  refreshPolicy: jsonb("refresh_policy"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sourceVersions = pgTable(
  "source_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    versionLabel: text("version_label").notNull(),
    publishedOn: date("published_on"),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    contentHash: char("content_hash", { length: 64 }).notNull(),
    etag: text("etag"),
    lastModified: text("last_modified"),
    status: sourceVersionStatusEnum("status").notNull().default("detected"),
    metadata: jsonb("metadata"),
  },
  (table) => [
    uniqueIndex("source_versions_source_label_hash_uq").on(
      table.sourceId,
      table.versionLabel,
      table.contentHash,
    ),
  ],
);

export const concepts = pgTable(
  "concepts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canonicalKey: text("canonical_key").notNull().unique(),
    conceptType: conceptTypeEnum("concept_type").notNull(),
    standardFamily: standardFamilyEnum("standard_family").notNull(),
    externalUri: text("external_uri"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("concepts_family_type_idx").on(table.standardFamily, table.conceptType),
  ],
);

export const conceptVersions = pgTable(
  "concept_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id),
    sourceVersionId: uuid("source_version_id")
      .notNull()
      .references(() => sourceVersions.id),
    officialName: text("official_name").notNull(),
    officialDefinition: text("official_definition"),
    summaryJa: text("summary_ja"),
    technicalNoteJa: text("technical_note_ja"),
    commonMisunderstanding: text("common_misunderstanding"),
    status: conceptVersionStatusEnum("status").notNull().default("draft"),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    qualityScore: numeric("quality_score", { precision: 5, scale: 2 }),
    /** Weighted FTS document (§5.1): name > summary > definition/notes. */
    searchDocument: tsvector("search_document").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce(official_name, '')), 'A') || setweight(to_tsvector('simple', coalesce(summary_ja, '')), 'B') || setweight(to_tsvector('simple', coalesce(official_definition, '')), 'C') || setweight(to_tsvector('simple', coalesce(technical_note_ja, '')), 'D')`,
    ),
  },
  (table) => [
    uniqueIndex("concept_versions_concept_source_uq").on(
      table.conceptId,
      table.sourceVersionId,
    ),
    index("concept_versions_status_idx").on(table.status),
    index("concept_versions_search_idx").using("gin", table.searchDocument),
    check(
      "concept_versions_quality_range",
      sql`${table.qualityScore} IS NULL OR (${table.qualityScore} >= 0 AND ${table.qualityScore} <= 100)`,
    ),
  ],
);

export const termLabels = pgTable(
  "term_labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id),
    language: varchar("language", { length: 10 }).notNull(),
    label: text("label").notNull(),
    normalizedLabel: text("normalized_label").notNull(),
    labelType: labelTypeEnum("label_type").notNull(),
    sourceVersionId: uuid("source_version_id").references(() => sourceVersions.id),
  },
  (table) => [
    index("term_labels_concept_idx").on(table.conceptId),
    index("term_labels_normalized_idx").on(table.normalizedLabel),
    index("term_labels_normalized_trgm_idx").using(
      "gin",
      table.normalizedLabel.op("gin_trgm_ops"),
    ),
  ],
);

export const conceptRelations = pgTable(
  "concept_relations",
  {
    sourceConceptId: uuid("source_concept_id")
      .notNull()
      .references(() => concepts.id),
    targetConceptId: uuid("target_concept_id")
      .notNull()
      .references(() => concepts.id),
    relationType: relationTypeEnum("relation_type").notNull(),
    sourceVersionId: uuid("source_version_id")
      .notNull()
      .references(() => sourceVersions.id),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    reviewStatus: relationReviewStatusEnum("review_status")
      .notNull()
      .default("automatic"),
  },
  (table) => [
    primaryKey({
      columns: [
        table.sourceConceptId,
        table.targetConceptId,
        table.relationType,
        table.sourceVersionId,
      ],
    }),
    index("concept_relations_target_idx").on(table.targetConceptId),
    check(
      "concept_relations_confidence_range",
      sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 1)`,
    ),
  ],
);

export const ifcMembers = pgTable("ifc_members", {
  conceptId: uuid("concept_id")
    .primaryKey()
    .references(() => concepts.id),
  schemaVersion: text("schema_version").notNull(),
  memberKind: ifcMemberKindEnum("member_kind").notNull(),
  schemaName: text("schema_name"),
  isAbstract: boolean("is_abstract").notNull().default(false),
  supertypeConceptId: uuid("supertype_concept_id").references(() => concepts.id),
  expressDeclaration: text("express_declaration"),
  deprecationState: deprecationStateEnum("deprecation_state")
    .notNull()
    .default("active"),
});

export const ifcAttributes = pgTable(
  "ifc_attributes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerConceptId: uuid("owner_concept_id")
      .notNull()
      .references(() => concepts.id),
    name: text("name").notNull(),
    attributeKind: attributeKindEnum("attribute_kind").notNull(),
    dataType: text("data_type").notNull(),
    optional: boolean("optional").notNull(),
    cardinalityMin: integer("cardinality_min"),
    cardinalityMax: integer("cardinality_max"),
    ordinal: integer("ordinal").notNull(),
    definition: text("definition"),
  },
  (table) => [
    index("ifc_attributes_owner_idx").on(table.ownerConceptId),
    check(
      "ifc_attributes_cardinality_min_range",
      sql`${table.cardinalityMin} IS NULL OR ${table.cardinalityMin} >= 0`,
    ),
    check(
      "ifc_attributes_cardinality_max_range",
      sql`${table.cardinalityMax} IS NULL OR ${table.cardinalityMax} >= 0`,
    ),
    check(
      "ifc_attributes_cardinality_order",
      sql`${table.cardinalityMin} IS NULL OR ${table.cardinalityMax} IS NULL OR ${table.cardinalityMin} <= ${table.cardinalityMax}`,
    ),
  ],
);

export const evidenceChunks = pgTable(
  "evidence_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conceptVersionId: uuid("concept_version_id").references(() => conceptVersions.id),
    sourceVersionId: uuid("source_version_id")
      .notNull()
      .references(() => sourceVersions.id),
    locatorType: locatorTypeEnum("locator_type").notNull(),
    locatorValue: text("locator_value").notNull(),
    content: text("content").notNull(),
    contentHash: char("content_hash", { length: 64 }).notNull(),
    language: varchar("language", { length: 10 }).notNull(),
    trustLevel: trustLevelEnum("trust_level").notNull(),
    tokenCount: integer("token_count").notNull(),
  },
  (table) => [
    index("evidence_chunks_concept_version_idx").on(table.conceptVersionId),
    index("evidence_chunks_hash_idx").on(table.contentHash),
  ],
);

export const embeddings = pgTable(
  "embeddings",
  {
    evidenceChunkId: uuid("evidence_chunk_id")
      .primaryKey()
      .references(() => evidenceChunks.id),
    modelId: text("model_id").notNull(),
    dimension: integer("dimension").notNull(),
    embedding: pgvector("embedding").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("embeddings_dimension_positive", sql`${table.dimension} > 0`),
    check(
      "embeddings_dimension_matches",
      sql`${table.dimension} = vector_dims(${table.embedding})`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// audit / job tables (§3.3)
// ---------------------------------------------------------------------------

export const ingestionRuns = pgTable("ingestion_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => sources.id),
  sourceVersionId: uuid("source_version_id").references(() => sourceVersions.id),
  status: ingestionRunStatusEnum("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  fetchedCount: integer("fetched_count").notNull().default(0),
  warningCount: integer("warning_count").notNull().default(0),
  errorSummary: jsonb("error_summary"),
});

export const ingestionItems = pgTable(
  "ingestion_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => ingestionRuns.id),
    itemHash: char("item_hash", { length: 64 }).notNull(),
    status: ingestionItemStatusEnum("status").notNull(),
    errorCode: text("error_code"),
    retryCount: integer("retry_count").notNull().default(0),
    payloadSummary: jsonb("payload_summary"),
  },
  (table) => [index("ingestion_items_run_idx").on(table.runId)],
);

export const reviewTasks = pgTable("review_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  diffSummary: jsonb("diff_summary"),
  assignedRole: text("assigned_role").notNull(),
  dueOn: date("due_on"),
  decision: reviewDecisionEnum("decision").notNull().default("pending"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    requestId: text("request_id"),
    beforeSummary: jsonb("before_summary"),
    afterSummary: jsonb("after_summary"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_events_target_idx").on(table.targetType, table.targetId)],
);

export const aiInteractions = pgTable("ai_interactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  anonymousSession: text("anonymous_session").notNull(),
  questionHash: char("question_hash", { length: 64 }).notNull(),
  answerId: uuid("answer_id"),
  evidenceIds: jsonb("evidence_ids"),
  rating: integer("rating"),
  tokenUsage: jsonb("token_usage"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const searchEventsDaily = pgTable(
  "search_events_daily",
  {
    day: date("day").notNull(),
    queryHash: char("query_hash", { length: 64 }).notNull(),
    searchCount: integer("search_count").notNull().default(0),
    zeroResultCount: integer("zero_result_count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.queryHash] })],
);
