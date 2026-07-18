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
} from "@obcda/contracts";

export type SearchOutcome = {
  items: SearchResultItem[];
  nextCursor: string | null;
};

export interface DictionaryRepository {
  search(query: SearchQuery): Promise<SearchOutcome>;
  getConceptById(id: string): Promise<ConceptDetail | null>;
  getRelations(conceptId: string): Promise<ConceptRelation[] | null>;
  listSources(): Promise<SourceSummary[]>;
  /** Readiness probe — false when the backing store is unavailable. */
  isReady(): Promise<boolean>;
}
