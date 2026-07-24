import { useEffect, useState, type FormEvent } from "react";
import type { ConceptDetail, SearchResultItem } from "@obcda/contracts";
import { Link } from "react-router-dom";

import { Chip, EmptyCard, LoadingCard, TextInput } from "../components/ui";
import { compareConcepts, fetchConcept, searchConcepts } from "../lib/api";
import { COMPARE_MAX, useCompare } from "../lib/compare";
import { conceptStatusLabel } from "../lib/labels";
import { usePageMeta } from "../lib/topbar";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; concepts: ConceptDetail[] }
  | { kind: "error"; message: string };

export function ComparePage() {
  usePageMeta("比較", "最大4件までの用語を比較");
  const compare = useCompare();
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [addQuery, setAddQuery] = useState("");
  const [candidates, setCandidates] = useState<SearchResultItem[]>([]);

  useEffect(() => {
    if (compare.ids.length === 0) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    // compare API は 2 件以上が対象 — 1 件のときは詳細 API で単独表示する
    const load =
      compare.ids.length >= 2
        ? compareConcepts(compare.ids).then((response) => response.data)
        : Promise.all(compare.ids.map((id) => fetchConcept(id))).then((responses) =>
            responses.map((response) => response.data),
          );
    load
      .then((concepts) => {
        if (!cancelled) setState({ kind: "loaded", concepts });
      })
      .catch(() => {
        if (!cancelled)
          setState({ kind: "error", message: "比較データの取得に失敗しました。" });
      });
    return () => {
      cancelled = true;
    };
  }, [compare.ids]);

  useEffect(() => {
    const q = addQuery.trim();
    if (!q) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchConcepts({ q, limit: 8 })
        .then((response) => {
          if (!cancelled) setCandidates(response.data);
        })
        .catch(() => {
          if (!cancelled) setCandidates([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addQuery]);

  const addCandidate = (id: string) => {
    compare.add(id);
    setAddQuery("");
    setCandidates([]);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (candidates.length > 0) addCandidate(candidates[0]!.id);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={submit} className="relative">
          <TextInput
            aria-label="比較する用語を検索して追加"
            placeholder="用語を追加…（検索して選択）"
            value={addQuery}
            onChange={(event) => setAddQuery(event.target.value)}
            disabled={compare.isFull}
            className="min-w-[220px] !px-[11px] !py-2 text-[13px]"
          />
          {candidates.length > 0 && (
            <ul className="absolute top-full right-0 left-0 z-10 mt-1 max-h-60 list-none overflow-auto rounded-lg border border-line bg-white p-1 shadow-[0_4px_12px_rgba(16,24,40,.08)]">
              {candidates.map((item) => {
                const disabled = compare.has(item.id) || compare.isFull;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => addCandidate(item.id)}
                      className="w-full cursor-pointer rounded-md px-2.5 py-1.5 text-left font-sans text-[13px] text-ink hover:bg-chip disabled:cursor-not-allowed disabled:text-faint"
                    >
                      {item.name}
                      <span className="ml-2 text-[11px] text-faint">
                        {item.standardFamily} / {item.version}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </form>
        <span className="text-[12px] text-faint">
          {compare.ids.length} / {COMPARE_MAX} 件
        </span>
      </div>

      {compare.ids.length === 0 && (
        <EmptyCard>
          比較する用語を検索結果または上のメニューから追加してください。
        </EmptyCard>
      )}

      {state.kind === "loading" && <LoadingCard label="⏳ 読み込んでいます…" />}
      {state.kind === "error" && (
        <p
          role="alert"
          className="m-0 rounded-[10px] border border-danger-line bg-danger-soft p-3 text-[13px] text-danger"
        >
          ⚠️ {state.message}
        </p>
      )}

      {state.kind === "loaded" && (
        <div className="flex flex-wrap gap-4">
          {state.concepts.map((concept) => (
            <div
              key={concept.id}
              className="flex w-[260px] flex-col gap-2.5 rounded-[10px] border border-line bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <Link
                  to={`/concepts/${concept.id}`}
                  className="text-[15px] font-semibold !text-ink"
                >
                  {concept.name}
                </Link>
                <button
                  type="button"
                  aria-label={`${concept.name} を比較から外す`}
                  onClick={() => compare.remove(concept.id)}
                  className="cursor-pointer border-none bg-transparent text-[13px] text-faint"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip>{concept.standardFamily}</Chip>
                <Chip>{concept.conceptType}</Chip>
                <Chip>{concept.version}</Chip>
              </div>
              <div className="text-[12px] leading-relaxed text-sub">
                {concept.summaryJa ?? "—"}
              </div>
              {concept.technicalNoteJa && (
                <div className="border-t border-line-soft pt-2 text-[11.5px] leading-relaxed text-faint">
                  🔧 {concept.technicalNoteJa}
                </div>
              )}
              <div className="border-t border-line-soft pt-2 text-[11px] text-faint">
                {conceptStatusLabel(concept.status)} ・ {concept.source.documentName} ・{" "}
                {concept.source.versionLabel}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
