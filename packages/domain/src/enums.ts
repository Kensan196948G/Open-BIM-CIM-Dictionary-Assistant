/**
 * Domain enums mirroring 詳細設計仕様書 §3.2/§3.3.
 * Defined as const tuples so both Zod schemas (contracts) and Drizzle pgEnum (db)
 * can consume the same single source of truth.
 */

export const CONCEPT_TYPES = [
  "term",
  "entity",
  "type",
  "enum",
  "select",
  "pset",
  "qset",
  "property",
  "document_term",
] as const;
export type ConceptType = (typeof CONCEPT_TYPES)[number];

export const STANDARD_FAMILIES = [
  "MLIT_BIMCIM",
  "IFC",
  "BSDD",
  "IDS",
  "BCF",
  "OTHER",
] as const;
export type StandardFamily = (typeof STANDARD_FAMILIES)[number];

export const LABEL_TYPES = [
  "preferred",
  "alternative",
  "abbreviation",
  "deprecated",
  "translation",
] as const;
export type LabelType = (typeof LABEL_TYPES)[number];

export const RELATION_TYPES = [
  "broader",
  "narrower",
  "related",
  "synonym",
  "confused_with",
  "inherits",
  "has_property",
  "applicable_pset",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const CONCEPT_VERSION_STATUSES = [
  "draft",
  "review",
  "published",
  "archived",
] as const;
export type ConceptVersionStatus = (typeof CONCEPT_VERSION_STATUSES)[number];

export const SOURCE_TYPES = ["web", "pdf", "api", "schema", "manual"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const LICENSE_STATUSES = [
  "permitted",
  "metadata_only",
  "review_required",
  "blocked",
] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export const SOURCE_VERSION_STATUSES = [
  "detected",
  "review",
  "published",
  "superseded",
  "failed",
] as const;
export type SourceVersionStatus = (typeof SOURCE_VERSION_STATUSES)[number];

export const IFC_MEMBER_KINDS = [
  "entity",
  "type",
  "enum",
  "select",
  "function",
  "rule",
] as const;
export type IfcMemberKind = (typeof IFC_MEMBER_KINDS)[number];

export const ATTRIBUTE_KINDS = ["explicit", "derived", "inverse"] as const;
export type AttributeKind = (typeof ATTRIBUTE_KINDS)[number];

export const DEPRECATION_STATES = ["active", "deprecated", "removed"] as const;
export type DeprecationState = (typeof DEPRECATION_STATES)[number];

export const TRUST_LEVELS = [
  "primary",
  "official_secondary",
  "reviewed_derivative",
] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

export const LOCATOR_TYPES = [
  "page",
  "section",
  "anchor",
  "uri",
  "schema_path",
] as const;
export type LocatorType = (typeof LOCATOR_TYPES)[number];

export const RELATION_REVIEW_STATUSES = ["automatic", "reviewed", "rejected"] as const;
export type RelationReviewStatus = (typeof RELATION_REVIEW_STATUSES)[number];
