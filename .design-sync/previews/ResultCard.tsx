import { ResultCard } from "@obcda/ui";

export const FullResult = () => (
  <ResultCard
    name="IfcAlignment"
    badges={["IFC", "entity", "IFC4.3.2.0"]}
    summary="道路・鉄道などの線形構造物で基準となる線形（アライメント）を表すエンティティです。平面線形・縦断線形・カントを組み合わせて位置の基準を定義します。"
    footnote="一致理由: 識別子一致、正式名称一致"
  />
);

export const JapaneseTerm = () => (
  <ResultCard
    name="属性情報"
    badges={["MLIT_BIMCIM", "document_term", "令和8年3月"]}
    summary="3次元モデルに付与する部材情報・数量・規格などの情報を指す国内 BIM/CIM 運用上の用語です。"
    footnote="一致理由: 正式名称一致"
  />
);

export const Minimal = () => <ResultCard name="IfcRoad" badges={["IFC", "entity"]} />;

export const ResultList = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <ResultCard
      name="IfcAlignmentHorizontal"
      badges={["IFC", "entity", "IFC4.3.2.0"]}
      summary="線形のうち平面（水平方向）の経路を表すエンティティです。"
      footnote="一致理由: 本文一致"
    />
    <ResultCard
      name="IfcAlignmentVertical"
      badges={["IFC", "entity", "IFC4.3.2.0"]}
      summary="線形のうち縦断（高さ方向）の勾配・縦断曲線を表すエンティティです。"
      footnote="一致理由: 本文一致"
    />
  </div>
);
