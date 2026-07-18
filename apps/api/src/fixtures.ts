/**
 * Typed access to fixtures/concepts.sample.json — the development/test seed
 * used by the in-memory repository until ingestion + Neon land.
 *
 * The fixture is validated with Zod at module load so drift between the JSON
 * and the domain enums fails fast at startup instead of surfacing as wrong
 * API responses.
 */

import {
  CONCEPT_TYPES,
  CONCEPT_VERSION_STATUSES,
  LABEL_TYPES,
  LICENSE_STATUSES,
  RELATION_TYPES,
  SOURCE_TYPES,
  STANDARD_FAMILIES,
} from "@obcda/domain";
import { z } from "zod";

import fixtureJson from "../../../fixtures/concepts.sample.json";

const FixtureLabelSchema = z.object({
  language: z.string().min(2).max(10),
  label: z.string().min(1),
  labelType: z.enum(LABEL_TYPES),
});

const FixtureRelationSchema = z.object({
  targetKey: z.string().min(1),
  relationType: z.enum(RELATION_TYPES),
});

const FixtureConceptSchema = z.object({
  id: z.uuid(),
  canonicalKey: z.string().min(1),
  conceptType: z.enum(CONCEPT_TYPES),
  standardFamily: z.enum(STANDARD_FAMILIES),
  name: z.string().min(1),
  version: z.string().min(1),
  status: z.enum(CONCEPT_VERSION_STATUSES),
  sourceVersionId: z.uuid(),
  summaryJa: z.string().nullable(),
  officialDefinition: z.string().nullable(),
  technicalNoteJa: z.string().nullable(),
  commonMisunderstanding: z.string().nullable(),
  externalUri: z.url().nullable(),
  labels: z.array(FixtureLabelSchema),
  relations: z.array(FixtureRelationSchema),
});

const FixtureSourceVersionSchema = z.object({
  id: z.uuid(),
  versionLabel: z.string().min(1),
  retrievedAt: z.iso.datetime(),
});

const FixtureSourceSchema = z.object({
  id: z.uuid(),
  code: z.string().min(1),
  nameJa: z.string().min(1),
  publisher: z.string().min(1),
  baseUrl: z.url(),
  sourceType: z.enum(SOURCE_TYPES),
  licenseStatus: z.enum(LICENSE_STATUSES),
  versions: z.array(FixtureSourceVersionSchema).min(1),
});

const DictionaryFixtureSchema = z.object({
  schemaVersion: z.string(),
  generatedAt: z.iso.datetime(),
  note: z.string(),
  sources: z.array(FixtureSourceSchema).min(1),
  concepts: z.array(FixtureConceptSchema).min(1),
});

export type DictionaryFixture = z.infer<typeof DictionaryFixtureSchema>;
export type FixtureConcept = DictionaryFixture["concepts"][number];
export type FixtureSource = DictionaryFixture["sources"][number];
export type FixtureSourceVersion = FixtureSource["versions"][number];
export type FixtureLabel = FixtureConcept["labels"][number];
export type FixtureRelation = FixtureConcept["relations"][number];

export const dictionaryFixture: DictionaryFixture =
  DictionaryFixtureSchema.parse(fixtureJson);
