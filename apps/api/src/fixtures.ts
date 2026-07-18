/**
 * Typed access to fixtures/concepts.sample.json — the development/test seed
 * used by the in-memory repository until ingestion + Neon land.
 */

import type {
  ConceptType,
  ConceptVersionStatus,
  LabelType,
  LicenseStatus,
  RelationType,
  SourceType,
  StandardFamily,
} from "@obcda/domain";

import fixtureJson from "../../../fixtures/concepts.sample.json";

export type FixtureLabel = {
  language: string;
  label: string;
  labelType: LabelType;
};

export type FixtureRelation = {
  targetKey: string;
  relationType: RelationType;
};

export type FixtureConcept = {
  id: string;
  canonicalKey: string;
  conceptType: ConceptType;
  standardFamily: StandardFamily;
  name: string;
  version: string;
  status: ConceptVersionStatus;
  sourceVersionId: string;
  summaryJa: string | null;
  officialDefinition: string | null;
  technicalNoteJa: string | null;
  commonMisunderstanding: string | null;
  externalUri: string | null;
  labels: FixtureLabel[];
  relations: FixtureRelation[];
};

export type FixtureSourceVersion = {
  id: string;
  versionLabel: string;
  retrievedAt: string;
};

export type FixtureSource = {
  id: string;
  code: string;
  nameJa: string;
  publisher: string;
  baseUrl: string;
  sourceType: SourceType;
  licenseStatus: LicenseStatus;
  versions: FixtureSourceVersion[];
};

export type DictionaryFixture = {
  schemaVersion: string;
  generatedAt: string;
  note: string;
  sources: FixtureSource[];
  concepts: FixtureConcept[];
};

// JSON imports widen literals to string; the integration tests re-validate all
// API responses against the Zod contracts, which catches fixture drift.
export const dictionaryFixture = fixtureJson as unknown as DictionaryFixture;
