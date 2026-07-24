import { useEffect, useState } from "react";
import type { SearchResultItem, TermLabel } from "@obcda/contracts";

import { Card, Chip, GhostButton, LoadingCard, PrimaryButton } from "../components/ui";
import { fetchConcept, searchConcepts } from "../lib/api";
import { LABEL_TYPE_LABELS } from "../lib/labels";
import { usePageMeta } from "../lib/topbar";

/** 学習カードの対象（ホームの注目用語と同じ 9 語を検索で解決する）。 */
const CARD_TERMS = [
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

const QUIZ = [
  {
    question: "「線形」はどの用語の日本語訳ですか？",
    options: ["属性情報", "IfcAlignment", "詳細度", "IfcRoad"],
    correctIndex: 1,
  },
  {
    question: "IfcAlignmentHorizontal の上位概念は？",
    options: ["IfcRoad", "IfcLinearPositioningElement", "IfcAlignment", "IfcBridge"],
    correctIndex: 2,
  },
  {
    question: "「詳細度」の略称として使われる英語表記は？",
    options: ["IDS", "LOD", "BCF", "bSDD"],
    correctIndex: 1,
  },
  {
    question: "IDS (Information Delivery Specification) はどの上位概念に含まれますか？",
    options: ["bSDD", "BCF", "openBIM", "IFC"],
    correctIndex: 2,
  },
  {
    question: "buildingSMART Data Dictionary の略称は？",
    options: ["BCF", "bSDD", "MVD", "IDS"],
    correctIndex: 1,
  },
];

export function LearnPage() {
  usePageMeta("学習", "用語カード・確認問題");
  const [cards, setCards] = useState<SearchResultItem[] | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [labelsById, setLabelsById] = useState<Record<string, TermLabel[]>>({});

  const [quizIndex, setQuizIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [quizDone, setQuizDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      CARD_TERMS.map((term) =>
        searchConcepts({ q: term, limit: 1 })
          .then((response) => response.data[0] ?? null)
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      const seen = new Set<string>();
      const unique = results.filter(
        (item): item is SearchResultItem =>
          item !== null && !seen.has(item.id) && Boolean(seen.add(item.id)),
      );
      setCards(unique);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = cards?.[cardIndex] ?? null;

  useEffect(() => {
    if (!current || !flipped || labelsById[current.id]) return;
    let cancelled = false;
    fetchConcept(current.id)
      .then((response) => {
        if (!cancelled)
          setLabelsById((prev) => ({ ...prev, [current.id]: response.data.labels }));
      })
      .catch(() => {
        // ラベルは補助情報 — 取得失敗時は summary のみ表示
      });
    return () => {
      cancelled = true;
    };
  }, [current, flipped, labelsById]);

  const move = (delta: number) => {
    if (!cards || cards.length === 0) return;
    setCardIndex((index) => (index + delta + cards.length) % cards.length);
    setFlipped(false);
  };

  const selectAnswer = (index: number) => {
    if (selected !== null) return;
    setSelected(index);
    if (index === QUIZ[quizIndex]!.correctIndex) setScore((value) => value + 1);
  };

  const nextQuestion = () => {
    if (quizIndex >= QUIZ.length - 1) {
      setQuizDone(true);
      return;
    }
    setQuizIndex((value) => value + 1);
    setSelected(null);
  };

  const restart = () => {
    setQuizIndex(0);
    setSelected(null);
    setScore(0);
    setQuizDone(false);
  };

  const quiz = QUIZ[quizIndex]!;
  const labels = current ? (labelsById[current.id] ?? []) : [];

  return (
    <>
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-[14px] font-semibold text-ink">🎓 用語カード</h2>
          <span className="text-[12px] text-faint">
            {cards && cards.length > 0 ? `${cardIndex + 1} / ${cards.length}` : "—"}
          </span>
        </div>
        {cards === null ? (
          <div className="mt-3.5">
            <LoadingCard label="⏳ 用語カードを準備しています…" />
          </div>
        ) : (
          <>
            <div className="mt-3.5 h-[220px] [perspective:1000px]">
              <button
                type="button"
                aria-label={flipped ? "カードの表面を見る" : "カードの裏面を見る"}
                onClick={() => setFlipped((value) => !value)}
                className="relative h-full w-full cursor-pointer border-none bg-transparent p-0 font-sans transition-transform duration-500 [transform-style:preserve-3d]"
                style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 rounded-[10px] border border-line bg-panel-flash p-5 text-center [backface-visibility:hidden]">
                  <div className="text-[20px] font-bold text-ink">
                    {current?.name ?? "—"}
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {current && (
                      <>
                        <Chip>{current.standardFamily}</Chip>
                        <Chip>{current.type}</Chip>
                        <Chip>{current.version}</Chip>
                      </>
                    )}
                  </div>
                  <div className="text-[11.5px] text-faint">クリックして裏面を見る</div>
                </div>
                <div className="absolute inset-0 flex [transform:rotateY(180deg)] flex-col justify-center gap-2 overflow-auto rounded-[10px] border border-line bg-white p-5 text-left [backface-visibility:hidden]">
                  <div className="text-[13px] leading-relaxed text-ink">
                    {current?.summaryJa ?? "—"}
                  </div>
                  {labels.map((label) => (
                    <div
                      key={`${label.labelType}:${label.language}:${label.label}`}
                      className="text-[11.5px] text-faint"
                    >
                      <span className="text-sub">
                        {LABEL_TYPE_LABELS[label.labelType] ?? label.labelType}:
                      </span>{" "}
                      {label.label}
                    </div>
                  ))}
                </div>
              </button>
            </div>
            <div className="mt-3.5 flex justify-center gap-2.5">
              <GhostButton
                type="button"
                onClick={() => move(-1)}
                className="px-4 py-2 text-[13px]"
              >
                ← 前へ
              </GhostButton>
              <GhostButton
                type="button"
                onClick={() => move(1)}
                className="px-4 py-2 text-[13px]"
              >
                次へ →
              </GhostButton>
            </div>
          </>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-[14px] font-semibold text-ink">✅ 確認問題</h2>
          <span className="text-[12px] text-faint">
            {quizDone ? "完了" : `${quizIndex + 1} / ${QUIZ.length}`}
          </span>
        </div>
        {quizDone ? (
          <div className="mt-3.5 text-center">
            <div className="text-[20px] font-bold text-ink">
              正解 {score} / {QUIZ.length}
            </div>
            <GhostButton
              type="button"
              onClick={restart}
              className="mt-2.5 px-4 py-2 text-[13px]"
            >
              🔄 もう一度
            </GhostButton>
          </div>
        ) : (
          <>
            <p className="mt-3.5 mb-0 text-[14px] font-semibold text-ink">
              {quiz.question}
            </p>
            <div className="mt-2.5 flex flex-col gap-2">
              {quiz.options.map((option, index) => {
                let optionClass = "border-line bg-white text-ink";
                if (selected !== null) {
                  if (index === quiz.correctIndex) {
                    optionClass = "border-ok-dot bg-ok-soft text-ok";
                  } else if (index === selected) {
                    optionClass = "border-danger-deep bg-danger-soft text-danger";
                  }
                }
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => selectAnswer(index)}
                    className={`cursor-pointer rounded-lg border px-3.5 py-3 text-left font-sans text-[13.5px] font-medium ${optionClass}`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {selected !== null && (
              <PrimaryButton
                type="button"
                onClick={nextQuestion}
                className="mt-3 !px-4 !py-2 !text-[13px]"
              >
                次の問題 →
              </PrimaryButton>
            )}
          </>
        )}
      </Card>
    </>
  );
}
