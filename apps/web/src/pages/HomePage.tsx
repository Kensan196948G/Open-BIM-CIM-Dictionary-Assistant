import { SearchBox } from "@obcda/ui";
import { Link, useNavigate } from "react-router-dom";

const FEATURED_TERMS = [
  "IfcAlignment",
  "属性情報",
  "BIM/CIMモデル",
  "詳細度",
  "openBIM",
  "IDS",
  "bSDD",
];

export function HomePage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="hero-heading" className="pt-6">
        <h1 id="hero-heading" className="text-2xl font-bold">
          BIM/CIM・IFC・属性情報を「探せる・分かる・根拠へ戻れる」
        </h1>
        <p className="mt-2 text-slate-600">
          公開仕様を横断検索し、やさしい説明・技術定義・出典・版をまとめて確認できます。
        </p>
        <div className="mt-4">
          <SearchBox
            autoFocus
            onSearch={(q) => navigate(`/search?q=${encodeURIComponent(q)}`)}
          />
        </div>
      </section>

      <section aria-labelledby="featured-heading">
        <h2 id="featured-heading" className="text-sm font-semibold text-slate-500">
          📌 注目の用語
        </h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {FEATURED_TERMS.map((term) => (
            <li key={term}>
              <Link
                to={`/search?q=${encodeURIComponent(term)}`}
                className="inline-block rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-800 hover:border-blue-600 hover:text-blue-700 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
              >
                {term}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="about-heading"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 id="about-heading" className="font-semibold">
          🧭 このシステムについて
        </h2>
        <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
          <li>
            国土交通省の BIM/CIM 公開基準・buildingSMART の公開標準を対象にしています
          </li>
          <li>説明には出典・版・取得日時を明示し、原典へ戻れるようにしています</li>
          <li>版が異なる定義は上書きせず、別の知識として保持します</li>
        </ul>
      </section>
    </div>
  );
}
