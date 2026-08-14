/**
 * Typed access to fixtures/concepts.sample.json — the development/test seed
 * used by the in-memory repository until ingestion + Neon land.
 *
 * The fixture is validated with Zod at module load so drift between the JSON
 * and the domain enums fails fast at startup instead of surfacing as wrong
 * API responses.
 */

import {
  ATTRIBUTE_KINDS,
  CONCEPT_TYPES,
  CONCEPT_VERSION_STATUSES,
  IFC_MEMBER_KINDS,
  LABEL_TYPES,
  LICENSE_STATUSES,
  RELATION_TYPES,
  SOURCE_TYPES,
  STANDARD_FAMILIES,
} from "@obcda/domain";
import { z } from "zod";

import fixtureJson from "../../../fixtures/concepts.sample.json";

const FixtureLabelSchema = z.strictObject({
  language: z.string().min(2).max(10),
  label: z.string().min(1),
  labelType: z.enum(LABEL_TYPES),
});

const FixtureRelationSchema = z.strictObject({
  targetKey: z.string().min(1),
  relationType: z.enum(RELATION_TYPES),
});

/** FR-101〜105: IFC メンバー詳細（継承・属性・Pset/Qto は属性表で表現）。 */
const FixtureIfcAttributeSchema = z.strictObject({
  name: z.string().min(1),
  attributeKind: z.enum(ATTRIBUTE_KINDS),
  dataType: z.string().min(1),
  optional: z.boolean(),
  definition: z.string().nullable(),
});

const FixtureIfcSchema = z.strictObject({
  schemaVersion: z.string().min(1),
  memberKind: z.enum(IFC_MEMBER_KINDS),
  isAbstract: z.boolean(),
  /** canonicalKey of the supertype — resolved to an id by the repository. */
  supertypeKey: z.string().nullable(),
  attributes: z.array(FixtureIfcAttributeSchema),
});

const FixtureConceptSchema = z.strictObject({
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
  ifc: FixtureIfcSchema.optional(),
});

const FixtureSourceVersionSchema = z.strictObject({
  id: z.uuid(),
  versionLabel: z.string().min(1),
  retrievedAt: z.iso.datetime(),
});

const FixtureSourceSchema = z.strictObject({
  id: z.uuid(),
  code: z.string().min(1),
  nameJa: z.string().min(1),
  publisher: z.string().min(1),
  baseUrl: z.url(),
  sourceType: z.enum(SOURCE_TYPES),
  licenseStatus: z.enum(LICENSE_STATUSES),
  versions: z.array(FixtureSourceVersionSchema).min(1),
});

const DictionaryFixtureSchema = z.strictObject({
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
