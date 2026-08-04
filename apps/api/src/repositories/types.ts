/**
 * Repository port (§2.1 dependency rule: routes/services depend on this
 * interface, not on a concrete store). MVP ships an in-memory fixtures
 * implementation; the Neon/Drizzle implementation replaces it behind the
 * same port (Issue #4/#5 follow-up).
 */

import type {
  ConceptDetail,
  ConceptRelation,
  SearchQuery,
  SearchResultItem,
  SourceSummary,
  SourceVersionSummary,
} from "@obcda/contracts";

export type SearchOutcome = {
  items: SearchResultItem[];
  nextCursor: string | null;
};

export interface DictionaryRepository {
  /**
   * Which backing store actually serves this instance. Surfaced verbatim by
   * /system/info so the UI mode pill reflects the real wiring instead of a
   * hard-coded label.
   */
  readonly environment: "fixtures" | "database";
  search(query: SearchQuery): Promise<SearchOutcome>;
  getConceptById(id: string): Promise<ConceptDetail | null>;
  getRelations(conceptId: string): Promise<ConceptRelation[] | null>;
  listSources(): Promise<SourceSummary[]>;
  /** null when the source id is unknown (vs. an empty version list). */
  getSourceVersions(sourceId: string): Promise<SourceVersionSummary[] | null>;
  /** Dictionary size facts for /system/info. */
  getStats(): Promise<{
    concepts: number;
    publishedConcepts: number;
    sources: number;
  }>;
  /**
   * Readiness probe — false when the backing store is unreachable OR holds no
   * published content: an empty dictionary must not take traffic (both
   * implementations gate on concept count; /health/ready maps false to 503).
   */
  isReady(): Promise<boolean>;
}
