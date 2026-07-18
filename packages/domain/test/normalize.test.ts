import { describe, expect, it } from "vitest";

import {
  compactFold,
  foldLabelText,
  normalizeLabel,
  normalizeLabelText,
} from "../src/normalize";

describe("normalizeLabelText", () => {
  it("applies Unicode NFC composition", () => {
    // カ + combining voiced mark (decomposed) → ガ (composed)
    expect(normalizeLabelText("ガ")).toBe("ガ");
  });

  it("trims and collapses whitespace runs including ideographic space", () => {
    expect(normalizeLabelText("  IFC　 4.3  ")).toBe("IFC 4.3");
    expect(normalizeLabelText("属性　情報")).toBe("属性 情報");
  });

  it("preserves original casing (IFC CamelCase identifiers)", () => {
    expect(normalizeLabelText("IfcAlignment")).toBe("IfcAlignment");
  });

  it("does not fold width — that belongs to the search key only", () => {
    expect(normalizeLabelText("ＩＦＣ")).toBe("ＩＦＣ");
  });
});

describe("foldLabelText", () => {
  it("folds full-width Latin and digits via NFKC", () => {
    expect(foldLabelText("ＩＦＣ４．３")).toBe("ifc4.3");
  });

  it("folds half-width katakana to full-width", () => {
    expect(foldLabelText("ﾃﾞｰﾀ")).toBe(foldLabelText("データ"));
  });

  it("absorbs the katakana long-vowel mark", () => {
    expect(foldLabelText("データ")).toBe("デタ");
  });

  it("absorbs middle dots", () => {
    expect(foldLabelText("プロパティ・セット")).toBe("プロパティセット");
    expect(foldLabelText("プロパティ･セット")).toBe("プロパティセット");
  });

  it("absorbs hyphen variants", () => {
    expect(foldLabelText("on-site")).toBe("onsite");
    expect(foldLabelText("on–site")).toBe("onsite"); // en dash
    expect(foldLabelText("on−site")).toBe("onsite"); // minus sign U+2212
  });

  it("lower-cases identifiers", () => {
    expect(foldLabelText("IfcAlignment")).toBe("ifcalignment");
  });

  it("keeps single spaces as word boundaries", () => {
    expect(foldLabelText("Property  Set")).toBe("property set");
  });
});

describe("compactFold", () => {
  it("removes all whitespace so spacing variants compare equal", () => {
    expect(compactFold("IFC 4.3")).toBe(compactFold("IFC4.3"));
    expect(compactFold("ＩＦＣ　４．３")).toBe("ifc4.3");
  });
});

describe("normalizeLabel", () => {
  it("keeps original untouched while deriving normalized and folded forms", () => {
    const label = normalizeLabel("  ＩｆｃＡｌｉｇｎｍｅｎｔ ", "en");
    expect(label.original).toBe("  ＩｆｃＡｌｉｇｎｍｅｎｔ ");
    expect(label.normalized).toBe("ＩｆｃＡｌｉｇｎｍｅｎｔ");
    expect(label.folded).toBe("ifcalignment");
    expect(label.language).toBe("en");
  });
});
