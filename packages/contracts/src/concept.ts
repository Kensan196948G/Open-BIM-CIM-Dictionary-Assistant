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

import { ResponseMetaSchema } from "./common";

export const TermLabelSchema = z.object({
  language: z.string().min(2).max(10),
  label: z.string(),
  labelType: z.enum(LABEL_TYPES),
});
export type TermLabel = z.infer<typeof TermLabelSchema>;

export const SourceRefSchema = z.object({
  sourceCode: z.string(),
  publisher: z.string(),
  documentName: z.string(),
  versionLabel: z.string(),
  url: z.url(),
  licenseStatus: z.enum(LICENSE_STATUSES),
  retrievedAt: z.iso.datetime(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

/** GET /api/v1/concepts/{id} response body (§7.2, §8.2 display order). */
export const ConceptDetailSchema = z.object({
  id: z.uuid(),
  canonicalKey: z.string(),
  conceptType: z.enum(CONCEPT_TYPES),
  standardFamily: z.enum(STANDARD_FAMILIES),
  name: z.string(),
  version: z.string(),
  status: z.enum(CONCEPT_VERSION_STATUSES),
  summaryJa: z.string().nullable(),
  officialDefinition: z.string().nullable(),
  technicalNoteJa: z.string().nullable(),
  commonMisunderstanding: z.string().nullable(),
  labels: z.array(TermLabelSchema),
  source: SourceRefSchema,
  externalUri: z.url().nullable(),
});
export type ConceptDetail = z.infer<typeof ConceptDetailSchema>;

export const ConceptRelationSchema = z.object({
  relationType: z.enum(RELATION_TYPES),
  targetConceptId: z.uuid(),
  targetCanonicalKey: z.string(),
  targetName: z.string(),
  targetSummaryJa: z.string().nullable(),
});
export type ConceptRelation = z.infer<typeof ConceptRelationSchema>;

export const ConceptRelationsResponseSchema = z.object({
  data: z.array(ConceptRelationSchema),
  meta: ResponseMetaSchema,
});
export type ConceptRelationsResponse = z.infer<typeof ConceptRelationsResponseSchema>;

export const ConceptDetailResponseSchema = z.object({
  data: ConceptDetailSchema,
  meta: ResponseMetaSchema,
});
export type ConceptDetailResponse = z.infer<typeof ConceptDetailResponseSchema>;

export const SourceSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  nameJa: z.string(),
  publisher: z.string(),
  baseUrl: z.url(),
  sourceType: z.enum(SOURCE_TYPES),
  licenseStatus: z.enum(LICENSE_STATUSES),
});
export type SourceSummary = z.infer<typeof SourceSummarySchema>;

export const SourcesResponseSchema = z.object({
  data: z.array(SourceSummarySchema),
  meta: ResponseMetaSchema,
});
export type SourcesResponse = z.infer<typeof SourcesResponseSchema>;

/** GET /api/v1/sources/{id}/versions item (§7.2). */
export const SourceVersionSummarySchema = z.object({
  id: z.uuid(),
  versionLabel: z.string(),
  retrievedAt: z.iso.datetime(),
});
export type SourceVersionSummary = z.infer<typeof SourceVersionSummarySchema>;

export const SourceVersionsResponseSchema = z.object({
  data: z.array(SourceVersionSummarySchema),
  meta: ResponseMetaSchema,
});
export type SourceVersionsResponse = z.infer<typeof SourceVersionsResponseSchema>;
