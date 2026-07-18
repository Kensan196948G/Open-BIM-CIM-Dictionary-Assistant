import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { SearchResponse } from "@obcda/contracts";

import { Badge } from "../components/Badge";
import { SearchBox } from "../components/SearchBox";
import { ApiError, searchConcepts } from "../lib/api";

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
    searchConcepts({ q: query })
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
      <SearchBox initialQuery={query} />

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
        <div role="status" className="rounded border border-slate-200 bg-white p-4">
          <p className="font-medium">
            「{query}」に一致する用語が見つかりませんでした。
          </p>
          <p className="mt-1 text-sm text-slate-600">
            表記（全角/半角・略語・英語名）を変えるか、別の関連語で検索してください。
          </p>
        </div>
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
                  className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-blue-500 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold text-blue-800">
                      {item.name}
                    </span>
                    <Badge>{item.standardFamily}</Badge>
                    <Badge>{item.type}</Badge>
                    <Badge>{item.version}</Badge>
                  </div>
                  {item.summaryJa && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-700">
                      {item.summaryJa}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    一致理由:{" "}
                    {item.matchedBy
                      .map((reason) => MATCH_REASON_LABELS[reason] ?? reason)
                      .join("、")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
