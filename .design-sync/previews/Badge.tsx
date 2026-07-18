import { Badge } from "@obcda/ui";

export const StandardFamily = () => <Badge>IFC</Badge>;

export const ConceptType = () => <Badge>entity</Badge>;

export const Version = () => <Badge>IFC4.3.2.0</Badge>;

export const JapaneseEra = () => <Badge>令和8年3月</Badge>;

export const InRow = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <span style={{ fontWeight: 600 }}>IfcAlignment</span>
    <Badge>IFC</Badge>
    <Badge>entity</Badge>
    <Badge>IFC4.3.2.0</Badge>
  </div>
);
