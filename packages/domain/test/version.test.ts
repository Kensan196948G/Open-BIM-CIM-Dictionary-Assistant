import { describe, expect, it } from "vitest";

import {
  compareIfcVersions,
  formatIfcVersion,
  parseIfcVersionLabel,
  parseJapaneseEraLabel,
  versionLabelsEqual,
} from "../src/version";

describe("parseIfcVersionLabel", () => {
  it("parses dotted release labels", () => {
    expect(parseIfcVersionLabel("IFC4.3.2.0")?.parts).toEqual([4, 3, 2, 0]);
  });

  it("accepts spacing, case and width variants", () => {
    expect(parseIfcVersionLabel("IFC 4.3")?.parts).toEqual([4, 3]);
    expect(parseIfcVersionLabel("ifc4.3")?.parts).toEqual([4, 3]);
    expect(parseIfcVersionLabel("ＩＦＣ４．３")?.parts).toEqual([4, 3]);
  });

  it("accepts the 4X3 schema spelling", () => {
    expect(parseIfcVersionLabel("IFC4X3")?.parts).toEqual([4, 3]);
    expect(parseIfcVersionLabel("ifc2x3")?.parts).toEqual([2, 3]);
  });

  it("captures addendum/corrigendum markers", () => {
    expect(parseIfcVersionLabel("IFC2x3 TC1")?.addendum).toBe("TC1");
    expect(parseIfcVersionLabel("IFC4 ADD2")?.addendum).toBe("ADD2");
    expect(parseIfcVersionLabel("IFC4X3_ADD2")?.addendum).toBe("ADD2");
  });

  it("returns null for non-IFC labels", () => {
    expect(parseIfcVersionLabel("令和8年3月")).toBeNull();
    expect(parseIfcVersionLabel("IFC")).toBeNull();
    expect(parseIfcVersionLabel("IFX4.3")).toBeNull();
  });
});

describe("compareIfcVersions", () => {
  const v = (label: string) => {
    const parsed = parseIfcVersionLabel(label);
    if (!parsed) throw new Error(`unparsable: ${label}`);
    return parsed;
  };

  it("orders by release parts", () => {
    expect(compareIfcVersions(v("IFC4"), v("IFC4.3"))).toBeLessThan(0);
    expect(compareIfcVersions(v("IFC4.3.2.0"), v("IFC4.3"))).toBeGreaterThan(0);
    expect(compareIfcVersions(v("IFC2x3"), v("IFC4"))).toBeLessThan(0);
  });

  it("treats missing trailing parts as zero", () => {
    expect(compareIfcVersions(v("IFC4.3"), v("IFC4.3.0.0"))).toBe(0);
  });

  it("breaks ties on addenda", () => {
    expect(compareIfcVersions(v("IFC4"), v("IFC4 ADD2"))).toBeLessThan(0);
    expect(compareIfcVersions(v("IFC4 ADD2"), v("IFC4 ADD2"))).toBe(0);
    expect(compareIfcVersions(v("IFC4 ADD2"), v("IFC4"))).toBeGreaterThan(0);
    expect(compareIfcVersions(v("IFC4 ADD1"), v("IFC4 ADD2"))).toBeLessThan(0);
  });
});

describe("formatIfcVersion", () => {
  it("renders canonical display labels", () => {
    expect(formatIfcVersion(parseIfcVersionLabel("ifc4X3")!)).toBe("IFC4.3");
    expect(formatIfcVersion(parseIfcVersionLabel("IFC4X3_ADD2")!)).toBe("IFC4.3 ADD2");
  });
});

describe("parseJapaneseEraLabel", () => {
  it("parses year+month publication labels", () => {
    expect(parseJapaneseEraLabel("令和8年3月")).toMatchObject({
      era: "令和",
      eraYear: 8,
      month: 3,
      gregorianYear: 2026,
    });
  });

  it("parses year-only labels and 元年", () => {
    expect(parseJapaneseEraLabel("平成31年")).toMatchObject({
      gregorianYear: 2019,
    });
    expect(parseJapaneseEraLabel("令和元年")).toMatchObject({
      eraYear: 1,
      gregorianYear: 2019,
    });
  });

  it("accepts full-width digits and internal spaces", () => {
    expect(parseJapaneseEraLabel("令和８年３月")?.gregorianYear).toBe(2026);
    expect(parseJapaneseEraLabel("令和 8 年 3 月")?.month).toBe(3);
  });

  it("rejects invalid months and unknown shapes", () => {
    expect(parseJapaneseEraLabel("令和8年13月")).toBeNull();
    expect(parseJapaneseEraLabel("令和8年0月")).toBeNull();
    expect(parseJapaneseEraLabel("令和0年")).toBeNull();
    expect(parseJapaneseEraLabel("2026-03")).toBeNull();
    expect(parseJapaneseEraLabel("IFC4.3")).toBeNull();
  });
});

describe("versionLabelsEqual", () => {
  it("matches IFC alias spellings", () => {
    expect(versionLabelsEqual("IFC4.3", "ifc4X3")).toBe(true);
    expect(versionLabelsEqual("IFC 4.3", "IFC4.3.0.0")).toBe(true);
    expect(versionLabelsEqual("IFC4.3", "IFC4.3.2.0")).toBe(false);
  });

  it("never matches across families", () => {
    expect(versionLabelsEqual("IFC4.3", "令和8年3月")).toBe(false);
    expect(versionLabelsEqual("令和8年3月", "IFC4.3")).toBe(false);
    expect(versionLabelsEqual("令和8年3月", "v1.0")).toBe(false);
    expect(versionLabelsEqual("v1.0", "令和8年3月")).toBe(false);
  });

  it("matches era labels structurally", () => {
    expect(versionLabelsEqual("令和8年3月", "令和８年３月")).toBe(true);
    expect(versionLabelsEqual("令和8年3月", "令和8年4月")).toBe(false);
    expect(versionLabelsEqual("令和8年", "令和8年3月")).toBe(false);
  });

  it("falls back to compact folded equality for other labels", () => {
    expect(versionLabelsEqual("v1.0", "V1.0")).toBe(true);
    expect(versionLabelsEqual("v1.0", "v1.1")).toBe(false);
  });
});
