/**
 * Fixtures-backed repository. Ranking is a simplified in-memory rendition of
 * 詳細設計仕様書 §5.2 (identifier > label > text > fuzzy); the SQL/FTS
 * implementation replaces this behind the same port once Neon lands.
 */

import type {
  ConceptDetail,
  ConceptRelation,
  MatchReason,
  SearchQuery,
  SourceSummary,
  SourceVersionSummary,
} from "@obcda/contracts";
import {
  compactFold,
  foldLabelText,
  parseIfcVersionLabel,
  versionLabelsEqual,
} from "@obcda/domain";

import type {
  DictionaryFixture,
  FixtureConcept,
  FixtureSource,
  FixtureSourceVersion,
} from "../fixtures";
import type { DictionaryRepository, SearchOutcome } from "./types";

type IndexedConcept = {
  concept: FixtureConcept;
  foldedName: string;
  foldedCompactName: string;
  foldedLabels: {
    compact: string;
    labelType: FixtureConcept["labels"][number]["labelType"];
  }[];
  foldedSummary: string;
};

type Scored = {
  entry: IndexedConcept;
  score: number;
  reasons: MatchReason[];
};

const SCORE = {
  exactIdentifier: 1,
  preferredLabel: 0.9,
  abbreviation: 0.85,
  alternativeLabel: 0.8,
  prefix: 0.6,
  substring: 0.5,
  summary: 0.4,
} as const;

/** Character-bigram Dice similarity — cheap stand-in for pg_trgm typo tolerance (FR-004). */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigramsOf = (s: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i += 1) {
      const gram = s.slice(i, i + 2);
      map.set(gram, (map.get(gram) ?? 0) + 1);
    }
    return map;
  };
  const left = bigramsOf(a);
  const right = bigramsOf(b);
  let shared = 0;
  for (const [gram, count] of left) {
    const other = right.get(gram);
    if (other !== undefined) shared += Math.min(count, other);
  }
  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

/** Does `filterLabel` (e.g. "IFC4.3") select `versionLabel` (e.g. "IFC4.3.2.0")? Prefix semantics for IFC releases. */
export function versionMatchesFilter(
  versionLabel: string,
  filterLabel: string,
): boolean {
  const filterIfc = parseIfcVersionLabel(filterLabel);
  const versionIfc = parseIfcVersionLabel(versionLabel);
  if (filterIfc && versionIfc) {
    const partsMatch = filterIfc.parts.every(
      (part, index) => (versionIfc.parts[index] ?? 0) === part,
    );
    if (!partsMatch) return false;
    // an addendum-bearing filter (IFC4 ADD2) selects only that addendum;
    // an addendum-free filter keeps prefix semantics and matches both
    if (filterIfc.addendum) return versionIfc.addendum === filterIfc.addendum;
    return true;
  }
  return versionLabelsEqual(versionLabel, filterLabel);
}

// btoa/atob keep the cursor Workers-compatible (no Node Buffer dependency).
function encodeCursor(offset: number): string {
  return btoa(`o:${offset}`)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeCursor(cursor: string): number | null {
  try {
    const decoded = atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
    const match = /^o:(\d{1,6})$/.exec(decoded);
    if (!match) return null;
    return Number.parseInt(match[1] ?? "", 10);
  } catch {
    return null;
  }
}

export class InMemoryDictionaryRepository implements DictionaryRepository {
  private readonly indexed: IndexedConcept[];
  private readonly byId: Map<string, FixtureConcept>;
  private readonly byKey: Map<string, FixtureConcept>;
  private readonly sourceVersionIndex: Map<
    string,
    { source: FixtureSource; version: FixtureSourceVersion }
  >;

  constructor(private readonly fixture: DictionaryFixture) {
    this.indexed = fixture.concepts.map((concept) => ({
      concept,
      foldedName: foldLabelText(concept.name),
      foldedCompactName: compactFold(concept.name),
      foldedLabels: concept.labels.map((label) => ({
        compact: compactFold(label.label),
        labelType: label.labelType,
      })),
      foldedSummary: foldLabelText(concept.summaryJa ?? ""),
    }));
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
    const compactQ = compactFold(query.q);
    const spacedQ = foldLabelText(query.q);
    if (compactQ.length === 0) return { items: [], nextCursor: null };

    const scored: Scored[] = [];
    for (const entry of this.indexed) {
      const { concept } = entry;
      if (concept.status !== "published") continue;
      if (query.family && concept.standardFamily !== query.family) continue;
      if (query.type && concept.conceptType !== query.type) continue;
      if (query.schema && !versionMatchesFilter(concept.version, query.schema)) {
        continue;
      }

      let score = 0;
      const reasons = new Set<MatchReason>();

      if (entry.foldedCompactName === compactQ) {
        score = Math.max(score, SCORE.exactIdentifier);
        reasons.add("exact_identifier");
      }
      for (const label of entry.foldedLabels) {
        if (label.compact !== compactQ) continue;
        if (label.labelType === "preferred") {
          score = Math.max(score, SCORE.preferredLabel);
          reasons.add("preferred_label");
        } else if (label.labelType === "abbreviation") {
          score = Math.max(score, SCORE.abbreviation);
          reasons.add("abbreviation");
        } else {
          score = Math.max(score, SCORE.alternativeLabel);
          reasons.add("alternative_label");
        }
      }

      if (compactQ.length >= 2) {
        const haystacks = [
          entry.foldedCompactName,
          ...entry.foldedLabels.map((label) => label.compact),
        ];
        if (haystacks.some((h) => h.startsWith(compactQ) && h !== compactQ)) {
          score = Math.max(score, SCORE.prefix);
          reasons.add("text");
        } else if (haystacks.some((h) => h.includes(compactQ) && h !== compactQ)) {
          score = Math.max(score, SCORE.substring);
          reasons.add("text");
        }
        if (spacedQ.length >= 2 && entry.foldedSummary.includes(spacedQ)) {
          score = Math.max(score, SCORE.summary);
          reasons.add("text");
        }
        if (score === 0) {
          const best = Math.max(
            diceSimilarity(compactQ, entry.foldedCompactName),
            ...entry.foldedLabels.map((label) =>
              diceSimilarity(compactQ, label.compact),
            ),
          );
          if (best >= 0.5) {
            score = 0.2 + 0.3 * best;
            reasons.add("fuzzy");
          }
        }
      }

      if (score > 0 && reasons.size > 0) {
        scored.push({ entry, score, reasons: [...reasons] });
      }
    }

    scored.sort(
      (a, b) =>
        b.score - a.score || a.entry.concept.name.localeCompare(b.entry.concept.name),
    );

    const offset = query.cursor ? (decodeCursor(query.cursor) ?? 0) : 0;
    const page = scored.slice(offset, offset + query.limit);
    const nextOffset = offset + query.limit;

    return {
      items: page.map(({ entry, score, reasons }) => ({
        id: entry.concept.id,
        canonicalKey: entry.concept.canonicalKey,
        name: entry.concept.name,
        type: entry.concept.conceptType,
        standardFamily: entry.concept.standardFamily,
        version: entry.concept.version,
        summaryJa: entry.concept.summaryJa,
        matchedBy: reasons,
        score: Math.min(1, Number(score.toFixed(4))),
      })),
      nextCursor: nextOffset < scored.length ? encodeCursor(nextOffset) : null,
    };
  }

  async getConceptById(id: string): Promise<ConceptDetail | null> {
    const concept = this.byId.get(id);
    if (!concept || concept.status !== "published") return null;
    const sourceRef = this.sourceVersionIndex.get(concept.sourceVersionId);
    if (!sourceRef) return null;
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

  async isReady(): Promise<boolean> {
    return this.indexed.length > 0;
  }
}
