-- 0001_init.sql — initial schema (詳細設計仕様書 §3.2/§3.3/§5.1)
-- Target: Neon PostgreSQL 17 compatible.
-- Note: keep packages/db/src/schema.ts in sync with this file.

BEGIN;

-- extensions -----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- pgvector; available on Neon. Embedding dimension is fixed once the model is
-- chosen (§3.2 embeddings) — the column is created without a fixed dimension
-- and the HNSW index is added together with the dimension in a later migration.
CREATE EXTENSION IF NOT EXISTS vector;

-- enums ----------------------------------------------------------------------
CREATE TYPE source_type AS ENUM ('web', 'pdf', 'api', 'schema', 'manual');
CREATE TYPE license_status AS ENUM ('permitted', 'metadata_only', 'review_required', 'blocked');
CREATE TYPE source_version_status AS ENUM ('detected', 'review', 'published', 'superseded', 'failed');
CREATE TYPE concept_type AS ENUM ('term', 'entity', 'type', 'enum', 'select', 'pset', 'qset', 'property', 'document_term');
CREATE TYPE standard_family AS ENUM ('MLIT_BIMCIM', 'IFC', 'BSDD', 'IDS', 'BCF', 'OTHER');
CREATE TYPE concept_version_status AS ENUM ('draft', 'review', 'published', 'archived');
CREATE TYPE label_type AS ENUM ('preferred', 'alternative', 'abbreviation', 'deprecated', 'translation');
CREATE TYPE relation_type AS ENUM ('broader', 'narrower', 'related', 'synonym', 'confused_with', 'inherits', 'has_property', 'applicable_pset');
CREATE TYPE relation_review_status AS ENUM ('automatic', 'reviewed', 'rejected');
CREATE TYPE ifc_member_kind AS ENUM ('entity', 'type', 'enum', 'select', 'function', 'rule');
CREATE TYPE attribute_kind AS ENUM ('explicit', 'derived', 'inverse');
CREATE TYPE deprecation_state AS ENUM ('active', 'deprecated', 'removed');
CREATE TYPE trust_level AS ENUM ('primary', 'official_secondary', 'reviewed_derivative');
CREATE TYPE locator_type AS ENUM ('page', 'section', 'anchor', 'uri', 'schema_path');
CREATE TYPE ingestion_run_status AS ENUM ('running', 'succeeded', 'partial', 'failed');
CREATE TYPE ingestion_item_status AS ENUM ('discovered', 'fetched', 'parsed', 'normalized', 'validated', 'review', 'published', 'unchanged', 'rejected', 'failed');
CREATE TYPE review_decision AS ENUM ('pending', 'approved', 'rejected');

-- core tables (§3.2) ---------------------------------------------------------

CREATE TABLE sources (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           varchar(80) NOT NULL UNIQUE,
  name_ja        text NOT NULL,
  publisher      text NOT NULL,
  base_url       text NOT NULL,
  source_type    source_type NOT NULL,
  license_status license_status NOT NULL,
  license_url    text,
  refresh_policy jsonb,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      uuid NOT NULL REFERENCES sources(id),
  version_label  text NOT NULL,
  published_on   date,
  effective_from date,
  effective_to   date,
  retrieved_at   timestamptz NOT NULL,
  content_hash   char(64) NOT NULL,
  etag           text,
  last_modified  text,
  status         source_version_status NOT NULL DEFAULT 'detected',
  metadata       jsonb
);
CREATE UNIQUE INDEX source_versions_source_label_hash_uq
  ON source_versions (source_id, version_label, content_hash);

CREATE TABLE concepts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_key   text NOT NULL UNIQUE,
  concept_type    concept_type NOT NULL,
  standard_family standard_family NOT NULL,
  external_uri    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX concepts_family_type_idx ON concepts (standard_family, concept_type);

CREATE TABLE concept_versions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id              uuid NOT NULL REFERENCES concepts(id),
  source_version_id       uuid NOT NULL REFERENCES source_versions(id),
  official_name           text NOT NULL,
  official_definition     text,
  summary_ja              text,
  technical_note_ja       text,
  common_misunderstanding text,
  status                  concept_version_status NOT NULL DEFAULT 'draft',
  valid_from              date,
  valid_to                date,
  reviewed_by             text,
  reviewed_at             timestamptz,
  quality_score           numeric(5,2)
    CONSTRAINT concept_versions_quality_range CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)),
  -- weighted FTS document (§5.1): name > summary > definition/notes
  search_document tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(official_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(summary_ja, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(official_definition, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(technical_note_ja, '')), 'D')
  ) STORED,
  CONSTRAINT concept_versions_concept_source_uq UNIQUE (concept_id, source_version_id)
);
CREATE INDEX concept_versions_status_idx ON concept_versions (status);
CREATE INDEX concept_versions_search_idx ON concept_versions USING GIN (search_document);

CREATE TABLE term_labels (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id        uuid NOT NULL REFERENCES concepts(id),
  language          varchar(10) NOT NULL,
  label             text NOT NULL,
  normalized_label  text NOT NULL,
  label_type        label_type NOT NULL,
  source_version_id uuid REFERENCES source_versions(id)
);
CREATE INDEX term_labels_concept_idx ON term_labels (concept_id);
CREATE INDEX term_labels_normalized_idx ON term_labels (normalized_label);
CREATE INDEX term_labels_normalized_trgm_idx ON term_labels USING GIN (normalized_label gin_trgm_ops);

CREATE TABLE concept_relations (
  source_concept_id uuid NOT NULL REFERENCES concepts(id),
  target_concept_id uuid NOT NULL REFERENCES concepts(id),
  relation_type     relation_type NOT NULL,
  source_version_id uuid NOT NULL REFERENCES source_versions(id),
  confidence        numeric(4,3)
    CONSTRAINT concept_relations_confidence_range CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  review_status     relation_review_status NOT NULL DEFAULT 'automatic',
  PRIMARY KEY (source_concept_id, target_concept_id, relation_type, source_version_id)
);
CREATE INDEX concept_relations_target_idx ON concept_relations (target_concept_id);

CREATE TABLE ifc_members (
  concept_id            uuid PRIMARY KEY REFERENCES concepts(id),
  schema_version        text NOT NULL,
  member_kind           ifc_member_kind NOT NULL,
  schema_name           text,
  is_abstract           boolean NOT NULL DEFAULT false,
  supertype_concept_id  uuid REFERENCES concepts(id),
  express_declaration   text,
  deprecation_state     deprecation_state NOT NULL DEFAULT 'active'
);

CREATE TABLE ifc_attributes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_concept_id uuid NOT NULL REFERENCES concepts(id),
  name             text NOT NULL,
  attribute_kind   attribute_kind NOT NULL,
  data_type        text NOT NULL,
  optional         boolean NOT NULL,
  cardinality_min  integer,
  cardinality_max  integer,
  ordinal          integer NOT NULL,
  definition       text
);
CREATE INDEX ifc_attributes_owner_idx ON ifc_attributes (owner_concept_id);

CREATE TABLE evidence_chunks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_version_id uuid REFERENCES concept_versions(id),
  source_version_id  uuid NOT NULL REFERENCES source_versions(id),
  locator_type       locator_type NOT NULL,
  locator_value      text NOT NULL,
  content            text NOT NULL,
  content_hash       char(64) NOT NULL,
  language           varchar(10) NOT NULL,
  trust_level        trust_level NOT NULL,
  token_count        integer NOT NULL
);
CREATE INDEX evidence_chunks_concept_version_idx ON evidence_chunks (concept_version_id);
CREATE INDEX evidence_chunks_hash_idx ON evidence_chunks (content_hash);

CREATE TABLE embeddings (
  evidence_chunk_id uuid PRIMARY KEY REFERENCES evidence_chunks(id),
  model_id          text NOT NULL,
  dimension         integer NOT NULL,
  embedding         vector NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
-- HNSW index is created in a later migration once the embedding dimension is
-- fixed (pgvector requires typed dimensions for HNSW).

-- audit / job tables (§3.3) --------------------------------------------------

CREATE TABLE ingestion_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         uuid NOT NULL REFERENCES sources(id),
  source_version_id uuid REFERENCES source_versions(id),
  status            ingestion_run_status NOT NULL DEFAULT 'running',
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  fetched_count     integer NOT NULL DEFAULT 0,
  warning_count     integer NOT NULL DEFAULT 0,
  error_summary     jsonb
);

CREATE TABLE ingestion_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES ingestion_runs(id),
  item_hash       char(64) NOT NULL,
  status          ingestion_item_status NOT NULL,
  error_code      text,
  retry_count     integer NOT NULL DEFAULT 0,
  payload_summary jsonb
);
CREATE INDEX ingestion_items_run_idx ON ingestion_items (run_id);

CREATE TABLE review_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type   text NOT NULL,
  target_id     uuid NOT NULL,
  diff_summary  jsonb,
  assigned_role text NOT NULL,
  due_on        date,
  decision      review_decision NOT NULL DEFAULT 'pending',
  decided_by    text,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor          text NOT NULL,
  action         text NOT NULL,
  target_type    text NOT NULL,
  target_id      text,
  request_id     text,
  before_summary jsonb,
  after_summary  jsonb,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_target_idx ON audit_events (target_type, target_id);

CREATE TABLE ai_interactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_session text NOT NULL,
  question_hash     char(64) NOT NULL,
  answer_id         uuid,
  evidence_ids      jsonb,
  rating            integer,
  token_usage       jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE search_events_daily (
  day               date NOT NULL,
  query_hash        char(64) NOT NULL,
  search_count      integer NOT NULL DEFAULT 0,
  zero_result_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, query_hash)
);

COMMIT;
