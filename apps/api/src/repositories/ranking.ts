/**
 * Shared ranking engine for DictionaryRepository.search() (詳細設計仕様書 §5.2:
 * identifier > label > text > fuzzy). Repository implementations fold their
 * candidates into ScorableConcept and delegate here, so ranking behavior stays
 * identical across storage backends (fixtures today, Neon alongside it).
 */

import type { MatchReason, SearchQuery } from "@obcda/contracts";
import {
  compactFold,
  foldLabelText,
  parseIfcVersionLabel,
  versionLabelsEqual,
  type ConceptType,
  type LabelType,
  type StandardFamily,
} from "@obcda/domain";

import type { SearchOutcome } from "./types";

export type ScorableLabel = {
  label: string;
  labelType: LabelType;
};

/** Callers pass only currently-published candidates — status filtering happens upstream. */
export type ScorableConcept = {
  id: string;
  canonicalKey: string;
  name: string;
  conceptType: ConceptType;
  standardFamily: StandardFamily;
  version: string;
  summaryJa: string | null;
  labels: ScorableLabel[];
};

type Scored = {
  concept: ScorableConcept;
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
export function encodeCursor(offset: number): string {
  return btoa(`o:${offset}`)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function decodeCursor(cursor: string): number | null {
  try {
    const decoded = atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
    const match = /^o:(\d{1,6})$/.exec(decoded);
    if (!match) return null;
    return Number.parseInt(match[1] ?? "", 10);
  } catch {
    return null;
  }
}

/**
 * Score, filter, sort, and paginate candidates for one search request.
 * family/type/schema are re-applied here even when a caller already pushed
 * them into a cheap upstream filter (e.g. SQL), so in-memory and SQL-backed
 * callers are guaranteed to rank identically either way.
 */
export function scoreAndPaginate(
  candidates: ScorableConcept[],
  query: SearchQuery,
): SearchOutcome {
  const compactQ = compactFold(query.q);
  const spacedQ = foldLabelText(query.q);
  if (compactQ.length === 0) return { items: [], nextCursor: null };

  const scored: Scored[] = [];
  for (const concept of candidates) {
    if (query.family && concept.standardFamily !== query.family) continue;
    if (query.type && concept.conceptType !== query.type) continue;
    if (query.schema && !versionMatchesFilter(concept.version, query.schema)) continue;

    const foldedCompactName = compactFold(concept.name);
    const foldedSummary = foldLabelText(concept.summaryJa ?? "");
    const foldedLabels = concept.labels.map((label) => ({
      compact: compactFold(label.label),
      labelType: label.labelType,
    }));

    let score = 0;
    const reasons = new Set<MatchReason>();

    if (foldedCompactName === compactQ) {
      score = Math.max(score, SCORE.exactIdentifier);
      reasons.add("exact_identifier");
    }
    for (const label of foldedLabels) {
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
        foldedCompactName,
        ...foldedLabels.map((label) => label.compact),
      ];
      if (haystacks.some((h) => h.startsWith(compactQ) && h !== compactQ)) {
        score = Math.max(score, SCORE.prefix);
        reasons.add("text");
      } else if (haystacks.some((h) => h.includes(compactQ) && h !== compactQ)) {
        score = Math.max(score, SCORE.substring);
        reasons.add("text");
      }
      if (spacedQ.length >= 2 && foldedSummary.includes(spacedQ)) {
        score = Math.max(score, SCORE.summary);
        reasons.add("text");
      }
      if (score === 0) {
        const best = Math.max(
          diceSimilarity(compactQ, foldedCompactName),
          ...foldedLabels.map((label) => diceSimilarity(compactQ, label.compact)),
        );
        if (best >= 0.5) {
          score = 0.2 + 0.3 * best;
          reasons.add("fuzzy");
        }
      }
    }

    if (score > 0 && reasons.size > 0) {
      scored.push({ concept, score, reasons: [...reasons] });
    }
  }

  scored.sort(
    (a, b) => b.score - a.score || a.concept.name.localeCompare(b.concept.name),
  );

  const offset = query.cursor ? (decodeCursor(query.cursor) ?? 0) : 0;
  const page = scored.slice(offset, offset + query.limit);
  const nextOffset = offset + query.limit;

  return {
    items: page.map(({ concept, score, reasons }) => ({
      id: concept.id,
      canonicalKey: concept.canonicalKey,
      name: concept.name,
      type: concept.conceptType,
      standardFamily: concept.standardFamily,
      version: concept.version,
      summaryJa: concept.summaryJa,
      matchedBy: reasons,
      score: Math.min(1, Number(score.toFixed(4))),
    })),
    nextCursor: nextOffset < scored.length ? encodeCursor(nextOffset) : null,
  };
}
