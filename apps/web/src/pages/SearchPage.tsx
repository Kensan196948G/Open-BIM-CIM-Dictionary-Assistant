import { useCallback, useEffect, useState, type FormEvent } from "react";
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

/** U1: 絞り込み（FR-003）。値は API の enum と対応し、URL に同期する。 */
const FAMILY_OPTIONS = [
  ["IFC", "IFC"],
  ["MLIT_BIMCIM", "国交省 BIM/CIM"],
  ["BSDD", "bSDD"],
  ["IDS", "IDS"],
  ["BCF", "BCF"],
  ["OTHER", "その他"],
] as const;

const TYPE_OPTIONS = [
  ["entity", "エンティティ"],
  ["type", "Type"],
  ["enum", "Enum"],
  ["select", "Select"],
  ["pset", "Pset"],
  ["qset", "Qto"],
  ["property", "Property"],
  ["term", "用語"],
  ["document_term", "要領・基準用語"],
] as const;

const SCHEMA_OPTIONS = ["IFC4.3", "IFC4", "IFC2x3", "令和8年3月"] as const;

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-sub">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-line bg-white px-2 py-1.5 font-sans text-[12.5px] text-ink focus:outline-2 focus:outline-offset-1 focus:outline-link"
      >
        <option value="">指定なし</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

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
  const family = searchParams.get("family") ?? "";
  const type = searchParams.get("type") ?? "";
  const schema = searchParams.get("schema") ?? "";
  usePageMeta("検索結果", query ? `「${query}」の検索結果` : "用語を検索してください");
  const [input, setInput] = useState(query);
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useEffect(() => {
    setInput(query);
  }, [query]);

  const setFilter = (key: "family" | "type" | "schema", value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    navigate(`/search?${params.toString()}`);
  };

  const runSearch = useCallback(
    (cursor?: string) => {
      if (query.trim().length === 0) {
        setState({ kind: "idle" });
        return;
      }
      searchConcepts({
        q: query,
        family: family || undefined,
        type: type || undefined,
        schema: schema || undefined,
        cursor,
        limit: loadSettings().searchLimit,
      })
        .then((response) => {
          setState((prev) =>
            prev.kind === "loaded" && cursor && prev.response.meta.nextCursor
              ? {
                  kind: "loaded",
                  response: {
                    ...response,
                    data: [...prev.response.data, ...response.data],
                  },
                }
              : { kind: "loaded", response },
          );
        })
        .catch((error: unknown) => {
          const message =
            error instanceof ApiError
              ? error.message
              : "検索中にエラーが発生しました。";
          setState({ kind: "error", message });
        });
    },
    [query, family, type, schema],
  );

  useEffect(() => {
    if (query.trim().length === 0) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "loading" });
    runSearch();
  }, [runSearch, query]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = input.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const hasFilter = family !== "" || type !== "" || schema !== "";
  const nextCursor = state.kind === "loaded" ? state.response.meta.nextCursor : null;
  const isFiltered = family !== "" || type !== "" || schema !== "";

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

      <div className="flex flex-wrap items-center gap-2.5">
        <Select
          label="標準"
          value={family}
          options={FAMILY_OPTIONS}
          onChange={(value) => setFilter("family", value)}
        />
        <Select
          label="種別"
          value={type}
          options={TYPE_OPTIONS}
          onChange={(value) => setFilter("type", value)}
        />
        <Select
          label="版"
          value={schema}
          options={SCHEMA_OPTIONS.map((option) => [option, option] as const)}
          onChange={(value) => setFilter("schema", value)}
        />
        {hasFilter && (
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams);
              params.delete("family");
              params.delete("type");
              params.delete("schema");
              navigate(`/search?${params.toString()}`);
            }}
            className="cursor-pointer border-none bg-transparent p-0 font-sans text-[11.5px] font-semibold text-faint hover:text-danger"
          >
            ✕ 絞り込みをクリア
          </button>
        )}
      </div>

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
          📊 検索結果 {state.response.data.length} 件{isFiltered && "（絞り込み中）"}
        </p>
      )}

      {state.kind === "loaded" && state.response.data.length === 0 && (
        <div className="rounded-[10px] border border-line bg-white p-6 text-center">
          <div className="text-[14px] font-semibold text-ink">
            「{query}」に一致する用語が見つかりませんでした。
          </div>
          <div className="mt-1.5 text-[13px] text-faint">
            表記（全角/半角・略語・英語名）を変えるか、別の関連語で検索してください。
            {hasFilter && " 絞り込み条件を外して再検索することもできます。"}
          </div>
        </div>
      )}

      {state.kind === "idle" && <EmptyCard>検索語を入力してください。</EmptyCard>}

      {state.kind === "loaded" && state.response.data.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {state.response.data.map((item) => (
            <ResultRow key={item.id} item={item} />
          ))}
          {nextCursor && (
            <div className="flex justify-center">
              <GhostButton
                type="button"
                onClick={() => runSearch(nextCursor)}
                className="px-5 py-2 text-[13px]"
              >
                ⏬ もっと見る
              </GhostButton>
            </div>
          )}
        </div>
      )}
    </>
  );
}
