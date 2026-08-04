import { useRef, useState, type FormEvent } from "react";
import type { SearchResultItem } from "@obcda/contracts";
import { Link } from "react-router";

import { Card, PrimaryButton, TextInput } from "../components/ui";
import { askAssistant, type AssistantAnswerResponse } from "../lib/api";
import { loadSettings } from "../lib/settings";
import { usePageMeta } from "../lib/topbar";

const EXAMPLE_QUESTIONS = [
  "IfcAlignmentとは？",
  "属性情報とプロパティは同じ？",
  "詳細度とLODは同じ？",
  "openBIMとIDSの関係は？",
  "橋梁のIFC表現は？",
  "宇宙エレベーターとは？",
];

type AskState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "answered"; response: AssistantAnswerResponse }
  | { kind: "error"; message: string };

function EvidenceCard({ item }: { item: SearchResultItem }) {
  return (
    <Card className="px-4 py-3.5">
      <Link
        to={`/concepts/${item.id}`}
        className="cursor-pointer text-[14px] font-semibold text-link"
      >
        {item.name}
      </Link>
      {item.summaryJa && (
        <p className="mt-1.5 mb-0 text-[13px] leading-relaxed text-sub">
          {item.summaryJa}
        </p>
      )}
      <p className="mt-1.5 mb-0 text-[11.5px] text-faint">
        出典: {item.standardFamily} ・ {item.version}
      </p>
    </Card>
  );
}

export function AiPage() {
  usePageMeta("AI質問", "検索した根拠だけを使って回答します");
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AskState>({ kind: "idle" });
  const requestSeq = useRef(0);

  const ask = (text: string) => {
    const q = text.trim();
    if (!q) return;
    const seq = ++requestSeq.current;
    setState({ kind: "loading" });
    askAssistant(q, loadSettings().explanationLevel)
      .then((response) => {
        if (seq === requestSeq.current) setState({ kind: "answered", response });
      })
      .catch(() => {
        if (seq === requestSeq.current)
          setState({ kind: "error", message: "回答の取得に失敗しました。" });
      });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(question);
  };

  const answered = state.kind === "answered" ? state.response.data : null;
  const refused = answered !== null && answered.answer.insufficientEvidence;
  const evidence = answered?.evidence ?? [];

  return (
    <>
      <Card className="px-[18px] py-4 text-[12.5px] leading-[1.7] text-sub">
        AIは「先生役」ではなく、公式資料へ案内するナビゲーターです。質問を検索語に変換し、複数の根拠を整理して回答します。根拠が不足する場合は回答を保留します。版が異なる定義は混ぜません。
      </Card>

      <div className="flex flex-wrap gap-2">
        {EXAMPLE_QUESTIONS.map((example) => (
          <button
            key={example}
            type="button"
            disabled={state.kind === "loading"}
            onClick={() => {
              setQuestion(example);
              ask(example);
            }}
            className="cursor-pointer rounded-[20px] border border-line bg-white px-[13px] py-[7px] font-sans text-[12px] font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {example}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <TextInput
          aria-label="AIへの質問"
          placeholder="質問を入力…（例: IfcAlignmentとは？）"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          className="flex-1"
        />
        <PrimaryButton type="submit" disabled={state.kind === "loading"}>
          🤖 質問する
        </PrimaryButton>
      </form>

      {state.kind === "loading" && (
        <p role="status" className="m-0 text-[12.5px] text-faint">
          ⏳ 根拠を検索しています…
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

      {refused && (
        <div className="rounded-[10px] border border-warn-line bg-warn-soft px-[18px] py-4 text-[13px] text-warn-deep">
          {answered.answer.answer ||
            "根拠となる情報が見つかりませんでした。質問を具体的な用語名（例: IfcAlignment、属性情報）にして再度お試しください。"}
        </div>
      )}

      {answered && !refused && answered.answer.answer && (
        <Card className="px-[18px] py-4">
          <div className="text-[12.5px] font-semibold text-faint">🤖 回答</div>
          <p className="mt-2 mb-0 text-[13.5px] leading-[1.7] whitespace-pre-wrap text-ink">
            {answered.answer.answer}
          </p>
          {answered.answer.caveats.length > 0 && (
            <ul className="mt-2 mb-0 pl-5 text-[12px] leading-relaxed text-faint">
              {answered.answer.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {answered && evidence.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="text-[12.5px] text-faint">🔗 根拠として見つかった情報:</div>
          {evidence.map((item) => (
            <EvidenceCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
