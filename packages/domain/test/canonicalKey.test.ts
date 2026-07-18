import { describe, expect, it } from "vitest";

import {
  buildCanonicalKey,
  CanonicalKeyError,
  parseCanonicalKey,
} from "../src/canonicalKey";

describe("buildCanonicalKey", () => {
  it("builds the documented shape", () => {
    expect(
      buildCanonicalKey({
        namespace: "ifc4x3",
        conceptType: "entity",
        name: "IfcAlignment",
      }),
    ).toBe("ifc4x3:entity:IfcAlignment");
  });

  it("accepts Japanese names and trims them", () => {
    expect(
      buildCanonicalKey({
        namespace: "mlit_bimcim_r8",
        conceptType: "document_term",
        name: " 属性情報 ",
      }),
    ).toBe("mlit_bimcim_r8:document_term:属性情報");
  });

  it("rejects invalid namespaces", () => {
    expect(() =>
      buildCanonicalKey({
        namespace: "IFC4x3",
        conceptType: "entity",
        name: "IfcAlignment",
      }),
    ).toThrow(CanonicalKeyError);
    expect(() =>
      buildCanonicalKey({ namespace: "_bad", conceptType: "term", name: "x" }),
    ).toThrow(CanonicalKeyError);
  });

  it("rejects unknown concept types", () => {
    expect(() =>
      buildCanonicalKey({
        namespace: "ifc4x3",
        // @ts-expect-error runtime validation of untrusted input
        conceptType: "widget",
        name: "IfcAlignment",
      }),
    ).toThrow(CanonicalKeyError);
  });

  it("rejects empty names and names containing ':'", () => {
    expect(() =>
      buildCanonicalKey({ namespace: "ifc4x3", conceptType: "entity", name: "  " }),
    ).toThrow(CanonicalKeyError);
    expect(() =>
      buildCanonicalKey({ namespace: "ifc4x3", conceptType: "entity", name: "a:b" }),
    ).toThrow(CanonicalKeyError);
  });
});

describe("parseCanonicalKey", () => {
  it("round-trips built keys", () => {
    const parts = {
      namespace: "bsdd",
      conceptType: "property" as const,
      name: "LoadBearing",
    };
    expect(parseCanonicalKey(buildCanonicalKey(parts))).toEqual(parts);
  });

  it("returns null for malformed keys", () => {
    expect(parseCanonicalKey("")).toBeNull();
    expect(parseCanonicalKey("only-two:segments")).toBeNull();
    expect(parseCanonicalKey("a:b:c:d")).toBeNull();
    expect(parseCanonicalKey("BAD:entity:IfcAlignment")).toBeNull();
    expect(parseCanonicalKey("ifc4x3:widget:IfcAlignment")).toBeNull();
    expect(parseCanonicalKey("ifc4x3:entity: ")).toBeNull();
  });

  it("rejects non-canonical names with surrounding whitespace", () => {
    expect(parseCanonicalKey("ifc4x3:entity: IfcAlignment")).toBeNull();
    expect(parseCanonicalKey("ifc4x3:entity:IfcAlignment ")).toBeNull();
  });
});
