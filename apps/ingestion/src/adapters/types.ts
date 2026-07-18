/**
 * SourceAdapter contract per 詳細設計仕様書 §4.1.
 *
 * Every official source (MLIT pages/PDFs, IFC EXPRESS, bSDD REST, …)
 * implements this interface; the pipeline runner drives
 * discover → fetch → parse → normalize → validate and records progress in
 * ingestion_runs / ingestion_items (§3.3).
 */

import type {
  ConceptType,
  LabelType,
  NormalizedLabel,
  RelationType,
  StandardFamily,
} from "@obcda/domain";

// ---------------------------------------------------------------------------
// pipeline data shapes
// ---------------------------------------------------------------------------

/** A source version detected upstream (before download). */
export type DiscoveredVersion = {
  sourceCode: string;
  versionLabel: string;
  url: string;
  etag?: string;
  lastModified?: string;
  metadata?: Record<string, unknown>;
};

/** A downloaded artifact with integrity metadata. */
export type RawArtifact = {
  url: string;
  contentType: string;
  bytes: Uint8Array;
  sha256: string;
  retrievedAt: string;
};

/** Locator back into the source document (§3.2 evidence_chunks.locator_*). */
export type SourceLocator = {
  locatorType: "page" | "section" | "anchor" | "uri" | "schema_path";
  locatorValue: string;
};

/** A source-shaped record extracted by a parser — not yet dictionary-shaped. */
export type ParsedRecord = {
  kind: string;
  externalId?: string;
  payload: unknown;
  locator: SourceLocator;
};

/** A dictionary-shaped record ready for diffing/review (§4.4). */
export type NormalizedRecord = {
  canonicalKey: string;
  conceptType: ConceptType;
  standardFamily: StandardFamily;
  officialName: string;
  labels: (NormalizedLabel & { labelType: LabelType })[];
  summaryJa?: string;
  officialDefinition?: string;
  externalUri?: string;
  relations: { targetKey: string; relationType: RelationType }[];
  locator: SourceLocator;
};

export type ValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type ValidationResult =
  { ok: true; warnings: ValidationIssue[] } | { ok: false; issues: ValidationIssue[] };

// ---------------------------------------------------------------------------
// contexts
// ---------------------------------------------------------------------------

/** Injected effects — adapters never reach for globals (testability, §4.3 制御の一元化). */
export type AdapterContext = {
  fetchImpl: typeof fetch;
  /** Hosts the adapter may contact — enforced again by the fetch guard. */
  allowedHosts: string[];
  now: () => Date;
};

export type DiscoverContext = AdapterContext;
export type FetchContext = AdapterContext & {
  /** Skip-download hints from the previous run (§4.3 ETag/hash). */
  previous?: { etag?: string; lastModified?: string; contentHash?: string };
};
export type ParseContext = { sourceCode: string };
export type NormalizeContext = { sourceCode: string; versionLabel: string };

// ---------------------------------------------------------------------------
// the adapter contract (§4.1)
// ---------------------------------------------------------------------------

export interface SourceAdapter {
  readonly sourceCode: string;
  discover(ctx: DiscoverContext): Promise<DiscoveredVersion[]>;
  fetch(version: DiscoveredVersion, ctx: FetchContext): Promise<RawArtifact[]>;
  parse(artifact: RawArtifact, ctx: ParseContext): AsyncIterable<ParsedRecord>;
  normalize(record: ParsedRecord, ctx: NormalizeContext): NormalizedRecord;
  validate(record: NormalizedRecord): ValidationResult;
}
