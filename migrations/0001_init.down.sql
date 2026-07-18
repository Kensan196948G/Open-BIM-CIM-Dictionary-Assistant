-- 0001_init.down.sql — full rollback of 0001_init.sql.
-- Order: dependents first (FK direction), then enums. Extensions are left
-- installed (shared server resources; harmless if present).
-- ⚠️ Destructive: drops all dictionary data. Production use requires the
-- restore procedure in docs/DEPLOYMENT.md (Neon branch/backup first).

BEGIN;

DROP TABLE IF EXISTS search_events_daily;
DROP TABLE IF EXISTS ai_interactions;
DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS review_tasks;
DROP TABLE IF EXISTS ingestion_items;
DROP TABLE IF EXISTS ingestion_runs;
DROP TABLE IF EXISTS embeddings;
DROP TABLE IF EXISTS evidence_chunks;
DROP TABLE IF EXISTS ifc_attributes;
DROP TABLE IF EXISTS ifc_members;
DROP TABLE IF EXISTS concept_relations;
DROP TABLE IF EXISTS term_labels;
DROP TABLE IF EXISTS concept_versions;
DROP TABLE IF EXISTS concepts;
DROP TABLE IF EXISTS source_versions;
DROP TABLE IF EXISTS sources;

DROP TYPE IF EXISTS review_decision;
DROP TYPE IF EXISTS ingestion_item_status;
DROP TYPE IF EXISTS ingestion_run_status;
DROP TYPE IF EXISTS locator_type;
DROP TYPE IF EXISTS trust_level;
DROP TYPE IF EXISTS deprecation_state;
DROP TYPE IF EXISTS attribute_kind;
DROP TYPE IF EXISTS ifc_member_kind;
DROP TYPE IF EXISTS relation_review_status;
DROP TYPE IF EXISTS relation_type;
DROP TYPE IF EXISTS label_type;
DROP TYPE IF EXISTS concept_version_status;
DROP TYPE IF EXISTS standard_family;
DROP TYPE IF EXISTS concept_type;
DROP TYPE IF EXISTS source_version_status;
DROP TYPE IF EXISTS license_status;
DROP TYPE IF EXISTS source_type;

COMMIT;
