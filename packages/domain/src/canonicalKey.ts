/**
 * Canonical keys are the stable, human-auditable identifiers for concepts,
 * e.g. `ifc4x3:entity:IfcAlignment` or `mlit_bimcim_r8:document_term:属性情報`.
 *
 * Shape: `{namespace}:{conceptType}:{name}`
 * - namespace:   lowercase snake identifier of the standard/schema scope
 * - conceptType: one of CONCEPT_TYPES
 * - name:        original-case identifier or term (IFC names keep CamelCase)
 */

import { CONCEPT_TYPES, type ConceptType } from "./enums";

export type CanonicalKeyParts = {
  namespace: string;
  conceptType: ConceptType;
  name: string;
};

const NAMESPACE_RE = /^[a-z0-9][a-z0-9_]*$/;

export class CanonicalKeyError extends Error {
  override readonly name = "CanonicalKeyError";
}

function isConceptType(value: string): value is ConceptType {
  return (CONCEPT_TYPES as readonly string[]).includes(value);
}

/** Build a canonical key, validating each segment. Throws CanonicalKeyError on invalid input. */
export function buildCanonicalKey(parts: CanonicalKeyParts): string {
  const { namespace, conceptType, name } = parts;
  if (!NAMESPACE_RE.test(namespace)) {
    throw new CanonicalKeyError(
      `invalid namespace: ${JSON.stringify(namespace)} (expected lowercase snake identifier)`,
    );
  }
  if (!isConceptType(conceptType)) {
    throw new CanonicalKeyError(`invalid conceptType: ${JSON.stringify(conceptType)}`);
  }
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new CanonicalKeyError("name must not be empty");
  }
  if (trimmedName.includes(":")) {
    throw new CanonicalKeyError("name must not contain ':'");
  }
  return `${namespace}:${conceptType}:${trimmedName}`;
}

/** Parse a canonical key. Returns null when the shape is invalid. */
export function parseCanonicalKey(key: string): CanonicalKeyParts | null {
  const segments = key.split(":");
  if (segments.length !== 3) return null;
  const [namespace, conceptType, name] = segments as [string, string, string];
  if (!NAMESPACE_RE.test(namespace)) return null;
  if (!isConceptType(conceptType)) return null;
  if (name.trim().length === 0) return null;
  return { namespace, conceptType, name };
}
