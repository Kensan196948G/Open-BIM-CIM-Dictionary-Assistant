import { Badge, SectionCard } from "@obcda/ui";

export const SystemInfo = () => (
  <SectionCard title="📊 システム情報">
    <dl style={{ display: "grid", gap: 4, fontSize: 14 }}>
      <div>
        <dt style={{ display: "inline", color: "#64748b" }}>バージョン:</dt>{" "}
        <dd style={{ display: "inline" }}>0.1.0</dd>
      </div>
      <div>
        <dt style={{ display: "inline", color: "#64748b" }}>データ基盤:</dt>{" "}
        <dd style={{ display: "inline" }}>
          <Badge>サンプル辞書（fixtures）</Badge>
        </dd>
      </div>
      <div>
        <dt style={{ display: "inline", color: "#64748b" }}>収録:</dt>{" "}
        <dd style={{ display: "inline" }}>概念 14 件・情報源 3 件</dd>
      </div>
    </dl>
  </SectionCard>
);

export const Provenance = () => (
  <SectionCard title="🔗 出典">
    <dl style={{ display: "grid", gap: 4, fontSize: 14 }}>
      <div>
        <dt style={{ display: "inline", color: "#64748b" }}>発行主体:</dt>{" "}
        <dd style={{ display: "inline" }}>buildingSMART International</dd>
      </div>
      <div>
        <dt style={{ display: "inline", color: "#64748b" }}>版:</dt>{" "}
        <dd style={{ display: "inline" }}>IFC4.3.2.0</dd>
      </div>
      <div>
        <dt style={{ display: "inline", color: "#64748b" }}>取得日時:</dt>{" "}
        <dd style={{ display: "inline" }}>2026/7/18 9:00:00</dd>
      </div>
    </dl>
  </SectionCard>
);

export const PlainText = () => (
  <SectionCard title="📘 やさしい説明">
    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
      道路・鉄道などの線形構造物で基準となる線形（アライメント）を表す概念です。
      平面線形・縦断線形・カントを組み合わせて位置の基準を定義します。
    </p>
  </SectionCard>
);
