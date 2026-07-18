import { useEffect, useState } from "react";
import type { SearchResponse } from "@obcda/contracts";
import { EmptyState, ResultCard, SearchBox } from "@obcda/ui";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, searchConcepts } from "../lib/api";
import { loadSettings } from "../lib/settings";

const MATCH_REASON_LABELS: Record<string, string> = {
  exact_identifier: "識別子一致",
  preferred_label: "正式名称一致",
  alternative_label: "別名一致",
  abbreviation: "略語一致",
  text: "本文一致",
  fuzzy: "類似候補",
};

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; response: SearchResponse }
  | { kind: "error"; message: string };

export function SearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useEffect(() => {
    if (query.trim().length === 0) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    searchConcepts({ q: query, limit: loadSettings().searchLimit })
      .then((response) => {
        if (!cancelled) setState({ kind: "loaded", response });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : "検索中にエラーが発生しました。";
        setState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="flex flex-col gap-4">
      <SearchBox
        initialQuery={query}
        onSearch={(q) => navigate(`/search?q=${encodeURIComponent(q)}`)}
      />

      {state.kind === "loading" && (
        <p role="status" className="text-slate-600">
          ⏳ 検索しています…
        </p>
      )}

      {state.kind === "error" && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-red-800"
        >
          ⚠️ {state.message}
        </p>
      )}

      {state.kind === "loaded" && state.response.data.length === 0 && (
        <EmptyState
          title={`「${query}」に一致する用語が見つかりませんでした。`}
          hint="表記（全角/半角・略語・英語名）を変えるか、別の関連語で検索してください。"
        />
      )}

      {state.kind === "loaded" && state.response.data.length > 0 && (
        <>
          <h1 className="text-sm text-slate-500">
            📊 「{query}」の検索結果 {state.response.data.length} 件
          </h1>
          <ul className="flex flex-col gap-3">
            {state.response.data.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/concepts/${item.id}`}
                  className="group block rounded-lg focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
                >
                  <ResultCard
                    name={item.name}
                    badges={[item.standardFamily, item.type, item.version]}
                    summary={item.summaryJa}
                    footnote={`一致理由: ${item.matchedBy
                      .map((reason) => MATCH_REASON_LABELS[reason] ?? reason)
                      .join("、")}`}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
