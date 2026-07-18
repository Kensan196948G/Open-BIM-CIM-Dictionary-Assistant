/**
 * Label normalization per 詳細設計仕様書 §4.4.
 *
 * Three layers are kept strictly separate:
 * - original:   the source spelling, never mutated (IFC identifiers keep CamelCase)
 * - normalized: display/storage form — Unicode NFC, trimmed, whitespace unified
 * - folded:     search-key form — width/case folded, long-vowel marks, middle
 *               dots and hyphen variants absorbed
 */

export type NormalizedLabel = {
  original: string;
  normalized: string;
  folded: string;
  language: string;
};

/** Runs of any Unicode whitespace (incl. U+3000 ideographic space). */
const WHITESPACE_RUN = /\s+/gu;

/** Middle dots absorbed for search keys (U+30FB, U+00B7; U+FF65 folds to U+30FB via NFKC). */
const MIDDLE_DOTS = /[・·]/gu;

/**
 * Katakana long-vowel mark and hyphen family absorbed for search keys.
 * U+30FC long vowel, ASCII hyphen, U+2010..U+2015 dashes, U+2212 minus.
 * (U+FF70 half-width long vowel and U+FF0D full-width hyphen fold via NFKC first.)
 */
const LONG_VOWEL_AND_HYPHENS = /[ー‐-―−-]/gu;

/** NFC + trim + collapse whitespace runs to a single ASCII space. Original casing preserved. */
export function normalizeLabelText(original: string): string {
  return original.normalize("NFC").replace(WHITESPACE_RUN, " ").trim();
}

/**
 * Search-key folding: NFKC width/compatibility folding, lower-casing, and
 * absorption of middle dots, long-vowel marks and hyphen variants.
 * Whitespace runs collapse to a single space (kept so trigram search still
 * sees word boundaries); use {@link compactFold} for identifier comparison.
 */
export function foldLabelText(original: string): string {
  return original
    .normalize("NFKC")
    .toLowerCase()
    .replace(MIDDLE_DOTS, "")
    .replace(LONG_VOWEL_AND_HYPHENS, "")
    .replace(WHITESPACE_RUN, " ")
    .trim();
}

/** Folded form with all whitespace removed — for exact-ish identifier matching ("IFC 4.3" ≡ "IFC4.3"). */
export function compactFold(original: string): string {
  return foldLabelText(original).replace(WHITESPACE_RUN, "");
}

/** Build the full three-layer label record for storage/search. */
export function normalizeLabel(original: string, language: string): NormalizedLabel {
  return {
    original,
    normalized: normalizeLabelText(original),
    folded: foldLabelText(original),
    language,
  };
}
