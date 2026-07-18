/**
 * Version-label handling per 詳細設計仕様書 §4.4 (alias management like
 * `IFC4.3` / `IFC 4.3` / `IFC4X3`) and §3.2 source_versions.
 *
 * Versions from different publishers are never merged: parsing only makes
 * labels comparable inside one family (IFC releases, Japanese era dates).
 */

import { compactFold } from "./normalize";

// ---------------------------------------------------------------------------
// IFC schema versions
// ---------------------------------------------------------------------------

export type IfcVersion = {
  family: "IFC";
  /** Numeric release parts, e.g. IFC4.3.2.0 → [4, 3, 2, 0] */
  parts: number[];
  /** Trailing addendum/corrigendum marker like ADD2 or TC1, if present. */
  addendum?: string;
  raw: string;
};

const IFC_LABEL_RE = /^ifc\s*(\d[\dx.\s]*)\s*(?:[_\s]*(add\d+|tc\d+))?$/i;

/**
 * Parse IFC release labels. Accepts spacing/width/case variants and the
 * `4X3`-style schema spelling: "IFC4.3", "IFC 4.3", "ifc4X3", "IFC4.3.2.0",
 * "IFC2x3 TC1", "IFC4 ADD2". Returns null for non-IFC labels.
 */
export function parseIfcVersionLabel(label: string): IfcVersion | null {
  const compact = label.normalize("NFKC").trim();
  const match = IFC_LABEL_RE.exec(compact);
  if (!match) return null;
  const [, numberPart, addendum] = match;
  if (!numberPart) return null;
  const digits = numberPart
    .toLowerCase()
    .replace(/\s+/gu, "")
    // schema spelling: 4x3 → 4.3
    .replace(/x/gu, ".");
  const segments = digits.split(".").filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;
  const parts: number[] = [];
  for (const segment of segments) {
    if (!/^\d+$/.test(segment)) return null;
    parts.push(Number.parseInt(segment, 10));
  }
  const version: IfcVersion = { family: "IFC", parts, raw: label };
  if (addendum) version.addendum = addendum.toUpperCase();
  return version;
}

/**
 * Compare two IFC versions by release parts (missing trailing parts count
 * as 0, so IFC4.3 ≡ IFC4.3.0.0). Addenda are compared lexically after parts.
 * Returns negative / 0 / positive like Array.prototype.sort comparators.
 */
export function compareIfcVersions(a: IfcVersion, b: IfcVersion): number {
  const length = Math.max(a.parts.length, b.parts.length);
  for (let i = 0; i < length; i += 1) {
    const left = a.parts[i] ?? 0;
    const right = b.parts[i] ?? 0;
    if (left !== right) return left - right;
  }
  const leftAdd = a.addendum ?? "";
  const rightAdd = b.addendum ?? "";
  return leftAdd < rightAdd ? -1 : leftAdd > rightAdd ? 1 : 0;
}

/** Canonical display form, e.g. [4,3,2,0] → "IFC4.3.2.0", with addendum suffix when present. */
export function formatIfcVersion(version: IfcVersion): string {
  const base = `IFC${version.parts.join(".")}`;
  return version.addendum ? `${base} ${version.addendum}` : base;
}

// ---------------------------------------------------------------------------
// Japanese era dates (MLIT publications like 令和8年3月)
// ---------------------------------------------------------------------------

export type JapaneseEraDate = {
  era: "令和" | "平成" | "昭和";
  eraYear: number;
  month?: number;
  gregorianYear: number;
  raw: string;
};

const ERA_START_YEAR: Record<JapaneseEraDate["era"], number> = {
  令和: 2019,
  平成: 1989,
  昭和: 1926,
};

const ERA_LABEL_RE = /^(令和|平成|昭和)(元|\d{1,2})年(?:(\d{1,2})月)?$/u;

/** Parse labels like "令和8年3月" / "平成31年" / "令和元年". Returns null when not an era date. */
export function parseJapaneseEraLabel(label: string): JapaneseEraDate | null {
  const compact = label.normalize("NFKC").replace(/\s+/gu, "");
  const match = ERA_LABEL_RE.exec(compact);
  if (!match) return null;
  const [, eraText, yearText, monthText] = match;
  const era = eraText as JapaneseEraDate["era"];
  const eraYear = yearText === "元" ? 1 : Number.parseInt(yearText ?? "", 10);
  if (!Number.isInteger(eraYear) || eraYear < 1) return null;
  const result: JapaneseEraDate = {
    era,
    eraYear,
    gregorianYear: ERA_START_YEAR[era] + eraYear - 1,
    raw: label,
  };
  if (monthText !== undefined) {
    const month = Number.parseInt(monthText, 10);
    if (month < 1 || month > 12) return null;
    result.month = month;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Label equivalence
// ---------------------------------------------------------------------------

/**
 * Do two version labels denote the same version?
 * IFC labels compare structurally ("IFC 4.3" ≡ "ifc4X3"); era dates compare by
 * era/year/month; anything else falls back to compact folded equality.
 */
export function versionLabelsEqual(a: string, b: string): boolean {
  const ifcA = parseIfcVersionLabel(a);
  const ifcB = parseIfcVersionLabel(b);
  if (ifcA && ifcB) return compareIfcVersions(ifcA, ifcB) === 0;
  if (ifcA !== null || ifcB !== null) return false;

  const eraA = parseJapaneseEraLabel(a);
  const eraB = parseJapaneseEraLabel(b);
  if (eraA && eraB) {
    return (
      eraA.era === eraB.era &&
      eraA.eraYear === eraB.eraYear &&
      (eraA.month ?? null) === (eraB.month ?? null)
    );
  }
  if (eraA !== null || eraB !== null) return false;

  return compactFold(a) === compactFold(b);
}
