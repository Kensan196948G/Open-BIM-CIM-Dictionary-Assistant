/**
 * Fail-closed repository for production misconfiguration: bound when
 * REQUIRE_DATABASE=true but DATABASE_URL is missing. /health/ready reports
 * 503 and data routes fail loudly (structured 500) instead of silently
 * serving stale fixtures.
 */

import type {
  ConceptDetail,
  ConceptRelation,
  SourceSummary,
  SourceVersionSummary,
} from "@obcda/contracts";

import type { DictionaryRepository, SearchOutcome } from "./types";

const unavailable = (): never => {
  // Message is static — safe for logs (no secrets, no request data).
  throw new Error(
    "Repository unavailable: DATABASE_URL is required but not configured",
  );
};

export class UnavailableDictionaryRepository implements DictionaryRepository {
  async search(): Promise<SearchOutcome> {
    return unavailable();
  }

  async getConceptById(): Promise<ConceptDetail | null> {
    return unavailable();
  }

  async getRelations(): Promise<ConceptRelation[] | null> {
    return unavailable();
  }

  async listSources(): Promise<SourceSummary[]> {
    return unavailable();
  }

  async getSourceVersions(): Promise<SourceVersionSummary[] | null> {
    return unavailable();
  }

  async getStats(): Promise<{
    concepts: number;
    publishedConcepts: number;
    sources: number;
  }> {
    return unavailable();
  }

  async isReady(): Promise<boolean> {
    return false;
  }
}
