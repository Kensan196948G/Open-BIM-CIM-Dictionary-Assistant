/**
 * Fixtures-backed repository. Ranking delegates to ./ranking (詳細設計仕様書 §5.2:
 * identifier > label > text > fuzzy) so behavior stays identical to the Neon-backed
 * implementation, which shares the same scoring engine behind the same port.
 */

import type {
  ConceptDetail,
  ConceptRelation,
  DictionaryExportConcept,
  SearchQuery,
  SourceSummary,
  SourceVersionSummary,
} from "@obcda/contracts";

import type {
  DictionaryFixture,
  FixtureConcept,
  FixtureSource,
  FixtureSourceVersion,
} from "../fixtures";
import { scoreAndPaginate, type ScorableConcept } from "./ranking";
import type { DictionaryRepository, SearchOutcome } from "./types";

export class InMemoryDictionaryRepository implements DictionaryRepository {
  readonly backend = "fixtures" as const;
  private readonly byId: Map<string, FixtureConcept>;
  private readonly byKey: Map<string, FixtureConcept>;
  private readonly sourceVersionIndex: Map<
    string,
    { source: FixtureSource; version: FixtureSourceVersion }
  >;

  constructor(private readonly fixture: DictionaryFixture) {
    this.byId = new Map(fixture.concepts.map((c) => [c.id, c]));
    this.byKey = new Map(fixture.concepts.map((c) => [c.canonicalKey, c]));
    this.sourceVersionIndex = new Map();
    for (const source of fixture.sources) {
      for (const version of source.versions) {
        this.sourceVersionIndex.set(version.id, { source, version });
      }
    }
  }

  async search(query: SearchQuery): Promise<SearchOutcome> {
    const candidates: ScorableConcept[] = this.fixture.concepts
      .filter((concept) => concept.status === "published")
      .map((concept) => ({
        id: concept.id,
        canonicalKey: concept.canonicalKey,
        name: concept.name,
        conceptType: concept.conceptType,
        standardFamily: concept.standardFamily,
        version: concept.version,
        summaryJa: concept.summaryJa,
        labels: concept.labels.map((label) => ({
          label: label.label,
          labelType: label.labelType,
        })),
      }));
    return scoreAndPaginate(candidates, query);
  }

  async getConceptById(id: string): Promise<ConceptDetail | null> {
    const concept = this.byId.get(id);
    if (!concept || concept.status !== "published") return null;
    const sourceRef = this.sourceVersionIndex.get(concept.sourceVersionId);
    if (!sourceRef) return null;
    const ifc = concept.ifc
      ? {
          schemaVersion: concept.ifc.schemaVersion,
          memberKind: concept.ifc.memberKind,
          isAbstract: concept.ifc.isAbstract,
          supertypeConceptId: concept.ifc.supertypeKey
            ? (this.byKey.get(concept.ifc.supertypeKey)?.id ?? null)
            : null,
          supertypeName: concept.ifc.supertypeKey
            ? (this.byKey.get(concept.ifc.supertypeKey)?.name ?? null)
            : null,
          attributes: concept.ifc.attributes,
        }
      : undefined;
    return {
      id: concept.id,
      canonicalKey: concept.canonicalKey,
      conceptType: concept.conceptType,
      standardFamily: concept.standardFamily,
      name: concept.name,
      version: concept.version,
      status: concept.status,
      summaryJa: concept.summaryJa,
      officialDefinition: concept.officialDefinition,
      technicalNoteJa: concept.technicalNoteJa,
      commonMisunderstanding: concept.commonMisunderstanding,
      labels: concept.labels.map((label) => ({
        language: label.language,
        label: label.label,
        labelType: label.labelType,
      })),
      source: {
        sourceCode: sourceRef.source.code,
        publisher: sourceRef.source.publisher,
        documentName: sourceRef.source.nameJa,
        versionLabel: sourceRef.version.versionLabel,
        url: sourceRef.source.baseUrl,
        licenseStatus: sourceRef.source.licenseStatus,
        retrievedAt: sourceRef.version.retrievedAt,
      },
      externalUri: concept.externalUri,
      ...(ifc ? { ifc } : {}),
    };
  }

  async getRelations(conceptId: string): Promise<ConceptRelation[] | null> {
    const concept = this.byId.get(conceptId);
    if (!concept || concept.status !== "published") return null;
    const relations: ConceptRelation[] = [];
    for (const relation of concept.relations) {
      const target = this.byKey.get(relation.targetKey);
      if (!target || target.status !== "published") continue;
      relations.push({
        relationType: relation.relationType,
        targetConceptId: target.id,
        targetCanonicalKey: target.canonicalKey,
        targetName: target.name,
        targetSummaryJa: target.summaryJa,
      });
    }
    return relations;
  }

  async listSources(): Promise<SourceSummary[]> {
    return this.fixture.sources.map((source) => ({
      id: source.id,
      code: source.code,
      nameJa: source.nameJa,
      publisher: source.publisher,
      baseUrl: source.baseUrl,
      sourceType: source.sourceType,
      licenseStatus: source.licenseStatus,
    }));
  }

  async getSourceVersions(sourceId: string): Promise<SourceVersionSummary[] | null> {
    const source = this.fixture.sources.find((s) => s.id === sourceId);
    if (!source) return null;
    return source.versions.map((version) => ({
      id: version.id,
      versionLabel: version.versionLabel,
      retrievedAt: version.retrievedAt,
    }));
  }

  async getStats(): Promise<{
    concepts: number;
    publishedConcepts: number;
    sources: number;
  }> {
    return {
      concepts: this.fixture.concepts.length,
      publishedConcepts: this.fixture.concepts.filter(
        (concept) => concept.status === "published",
      ).length,
      sources: this.fixture.sources.length,
    };
  }

  async exportPublishedConcepts(): Promise<DictionaryExportConcept[]> {
    const exported: DictionaryExportConcept[] = [];
    for (const concept of this.fixture.concepts) {
      if (concept.status !== "published") continue;
      const detail = await this.getConceptById(concept.id);
      if (!detail) continue;
      exported.push({
        ...detail,
        relations: concept.relations
          .map((relation) => {
            const target = this.byKey.get(relation.targetKey);
            return target
              ? {
                  relationType: relation.relationType,
                  targetCanonicalKey: target.canonicalKey,
                }
              : null;
          })
          .filter(
            (relation): relation is NonNullable<typeof relation> => relation !== null,
          ),
      });
    }
    return exported;
  }

  async isReady(): Promise<boolean> {
    return this.fixture.concepts.length > 0;
  }
}
