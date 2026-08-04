import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";

import { Card, PrimaryButton, TextInput } from "../components/ui";
import { fetchSystemInfo } from "../lib/api";
import { usePageMeta } from "../lib/topbar";

const FEATURED_TERMS = [
  "IfcAlignment",
  "属性情報",
  "BIM/CIMモデル",
  "詳細度",
  "openBIM",
  "IDS",
  "bSDD",
  "IfcRoad",
  "IfcBridge",
];

type Kpi = { concepts: number; published: number; sources: number };

export function HomePage() {
  usePageMeta("ホーム", "BIM/CIM・IFC・属性情報を探す");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [kpi, setKpi] = useState<Kpi | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSystemInfo()
      .then((response) => {
        if (cancelled) return;
        const counts = response.data.counts;
        setKpi({
          concepts: counts.concepts,
          published: counts.publishedConcepts,
          sources: counts.sources,
        });
      })
      .catch(() => {
        // KPI は補助情報 — 取得失敗時は「—」のまま
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <>
      <Card className="p-6 shadow-[0_1px_2px_rgba(16,24,40,.04)]">
        <h2 className="m-0 text-[22px] font-bold text-ink">
          BIM/CIM・IFC・属性情報を「探せる・分かる・根拠へ戻れる」
        </h2>
        <p className="mt-2 mb-0 text-[14px] leading-relaxed text-sub">
          公開仕様を横断検索し、やさしい説明・技術定義・出典・版をまとめて確認できます。
        </p>
        <form className="mt-4 flex gap-2" onSubmit={submit} role="search">
          <TextInput
            type="search"
            aria-label="用語を検索"
            placeholder="例: IfcAlignment、属性情報、LOD"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="flex-1"
          />
          <PrimaryButton type="submit">🔎 検索</PrimaryButton>
        </form>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">
        {(
          [
            { label: "収録概念", value: kpi?.concepts, unitClass: "text-ok" },
            { label: "公開済み", value: kpi?.published, unitClass: "text-ok" },
            { label: "情報源", value: kpi?.sources, unitClass: "text-link" },
          ] as const
        ).map((item) => (
          <div
            key={item.label}
            className="flex flex-col gap-[7px] rounded-[10px] border border-line bg-white px-[17px] py-4 shadow-[0_1px_2px_rgba(16,24,40,.04)]"
          >
            <div className="text-[11.5px] font-medium text-faint">{item.label}</div>
            <div className="text-[28px] leading-none font-semibold text-ink">
              {item.value ?? "—"}
            </div>
            <div className={`text-[11px] font-medium ${item.unitClass}`}>件</div>
          </div>
        ))}
      </div>

      <section aria-labelledby="featured-heading">
        <h2
          id="featured-heading"
          className="mt-0 mb-2 text-[12.5px] font-semibold text-faint"
        >
          📌 注目の用語
        </h2>
        <div className="flex flex-wrap gap-2">
          {FEATURED_TERMS.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => navigate(`/search?q=${encodeURIComponent(term)}`)}
              className="cursor-pointer rounded-[20px] border border-line bg-white px-[13px] py-[7px] font-sans text-[12.5px] font-medium text-ink focus:outline-2 focus:outline-offset-2 focus:outline-link"
            >
              {term}
            </button>
          ))}
        </div>
      </section>

      <Card className="px-[18px] py-[17px]">
        <h2 className="m-0 text-[14px] font-semibold text-ink">
          🧭 このシステムについて
        </h2>
        <ul className="mt-2 mb-0 pl-5 text-[13px] leading-[1.8] text-sub">
          <li>
            国土交通省の BIM/CIM 公開基準・buildingSMART の公開標準を対象にしています
          </li>
          <li>説明には出典・版・取得日時を明示し、原典へ戻れるようにしています</li>
          <li>版が異なる定義は上書きせず、別の知識として保持します</li>
        </ul>
      </Card>
    </>
  );
}
