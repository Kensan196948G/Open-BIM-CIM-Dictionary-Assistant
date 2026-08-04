import { useEffect, useState, type FormEvent } from "react";
import type { SearchResponse, SearchResultItem } from "@obcda/contracts";
import { Link, useNavigate, useSearchParams } from "react-router";

import {
  Card,
  Chip,
  EmptyCard,
  GhostButton,
  PrimaryButton,
  TextInput,
} from "../components/ui";
import { ApiError, searchConcepts } from "../lib/api";
import { useCompare } from "../lib/compare";
import { MATCH_REASON_LABELS } from "../lib/labels";
import { loadSettings } from "../lib/settings";
import { usePageMeta } from "../lib/topbar";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; response: SearchResponse }
  | { kind: "error"; message: string };

function ResultRow({ item }: { item: SearchResultItem }) {
  const compare = useCompare();
  const inCompare = compare.has(item.id);
  return (
    <Card className="px-[17px] py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/concepts/${item.id}`}
          className="cursor-pointer text-[16px] font-semibold text-link"
        >
          {item.name}
        </Link>
        <Chip>{item.standardFamily}</Chip>
        <Chip>{item.type}</Chip>
        <Chip>{item.version}</Chip>
      </div>
      {item.summaryJa && (
        <p className="mt-2 mb-0 text-[13px] leading-relaxed text-sub">
          {item.summaryJa}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2.5">
        <span className="text-[11.5px] text-faint">
          一致理由:{" "}
          {item.matchedBy
            .map((reason) => MATCH_REASON_LABELS[reason] ?? reason)
            .join("、")}
        </span>
        <GhostButton
          type="button"
          onClick={() => compare.toggle(item.id)}
          disabled={!inCompare && compare.isFull}
          className="px-[11px] py-[5px] text-[12px] !text-sub"
        >
          {inCompare ? "✓ 比較に追加済み" : "＋ 比較に追加"}
        </GhostButton>
      </div>
    </Card>
  );
}

export function SearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  usePageMeta("検索結果", query ? `「${query}」の検索結果` : "用語を検索してください");
  const [input, setInput] = useState(query);
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useEffect(() => {
    setInput(query);
  }, [query]);

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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = input.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <>
      <form className="flex gap-2" onSubmit={submit} role="search">
        <TextInput
          type="search"
          aria-label="用語を検索"
          placeholder="例: IfcAlignment、属性情報、LOD"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="flex-1"
        />
        <PrimaryButton type="submit">🔎 検索</PrimaryButton>
      </form>

      {state.kind === "loading" && (
        <p role="status" className="m-0 text-[12.5px] text-faint">
          ⏳ 検索しています…
        </p>
      )}

      {state.kind === "error" && (
        <p
          role="alert"
          className="m-0 rounded-[10px] border border-danger-line bg-danger-soft p-3 text-[13px] text-danger"
        >
          ⚠️ {state.message}
        </p>
      )}

      {state.kind === "loaded" && (
        <p className="m-0 text-[12.5px] text-faint">
          📊 検索結果 {state.response.data.length} 件
        </p>
      )}

      {state.kind === "loaded" && state.response.data.length === 0 && (
        <div className="rounded-[10px] border border-line bg-white p-6 text-center">
          <div className="text-[14px] font-semibold text-ink">
            「{query}」に一致する用語が見つかりませんでした。
          </div>
          <div className="mt-1.5 text-[13px] text-faint">
            表記（全角/半角・略語・英語名）を変えるか、別の関連語で検索してください。
          </div>
        </div>
      )}

      {state.kind === "idle" && <EmptyCard>検索語を入力してください。</EmptyCard>}

      {state.kind === "loaded" && state.response.data.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {state.response.data.map((item) => (
            <ResultRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
