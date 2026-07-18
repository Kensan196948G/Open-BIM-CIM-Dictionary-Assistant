import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ConceptDetailResponse, ConceptRelationsResponse } from "@obcda/contracts";

import { Badge } from "../components/Badge";
import { ApiError, fetchConcept, fetchRelations } from "../lib/api";

const RELATION_LABELS: Record<string, string> = {
  broader: "上位概念",
  narrower: "下位概念",
  related: "関連語",
  synonym: "同義語",
  confused_with: "混同しやすい語",
  inherits: "継承元",
  has_property: "属性",
  applicable_pset: "適用可能な Pset",
};

const LABEL_TYPE_LABELS: Record<string, string> = {
  preferred: "正式名称",
  alternative: "別名",
  abbreviation: "略語",
  deprecated: "非推奨",
  translation: "訳語",
};

type LoadState =
  | { kind: "loading" }
  | {
      kind: "loaded";
      detail: ConceptDetailResponse;
      relations: ConceptRelationsResponse;
    }
  | { kind: "error"; message: string; notFound: boolean };

export function ConceptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setState({ kind: "loading" });
    Promise.all([fetchConcept(id), fetchRelations(id)])
      .then(([detail, relations]) => {
        if (!cancelled) setState({ kind: "loaded", detail, relations });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError) {
          setState({
            kind: "error",
            message: error.message,
            notFound: error.status === 404,
          });
        } else {
          setState({
            kind: "error",
            message: "読み込み中にエラーが発生しました。",
            notFound: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.kind === "loading") {
    return (
      <p role="status" className="text-slate-600">
        ⏳ 読み込んでいます…
      </p>
    );
  }

  if (state.kind === "error") {
    return (
      <div role="alert" className="rounded border border-red-300 bg-red-50 p-4">
        <p className="text-red-800">⚠️ {state.message}</p>
        <Link to="/" className="mt-2 inline-block text-blue-700 underline">
          ホームへ戻る
        </Link>
      </div>
    );
  }

  const concept = state.detail.data;
  const relations = state.relations.data;

  return (
    <article className="flex flex-col gap-5">
      {/* 1. 名称・種別・標準・版・状態 (§8.2) */}
      <header>
        <h1 className="text-2xl font-bold">{concept.name}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge>{concept.standardFamily}</Badge>
          <Badge>{concept.conceptType}</Badge>
          <Badge>版: {concept.version}</Badge>
          <Badge>
            {concept.status === "published" ? "✅ 公開済み" : concept.status}
          </Badge>
        </div>
        {concept.labels.length > 0 && (
          <dl className="mt-2 text-sm text-slate-600">
            {concept.labels.map((label) => (
              <div
                key={`${label.language}:${label.label}`}
                className="inline-block mr-4"
              >
                <dt className="inline text-slate-500">
                  {LABEL_TYPE_LABELS[label.labelType] ?? label.labelType} (
                  {label.language}):
                </dt>{" "}
                <dd className="inline">{label.label}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      {/* 2. やさしい説明 */}
      {concept.summaryJa && (
        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="font-semibold text-slate-800">
            📘 やさしい説明
          </h2>
          <p className="mt-1 text-slate-700">{concept.summaryJa}</p>
        </section>
      )}

      {/* 3. 公式定義または原典参照 */}
      <section aria-labelledby="definition-heading">
        <h2 id="definition-heading" className="font-semibold text-slate-800">
          📖 公式定義
        </h2>
        {concept.officialDefinition ? (
          <p className="mt-1 text-slate-700">{concept.officialDefinition}</p>
        ) : (
          <p className="mt-1 text-sm text-slate-600">
            公式定義の本文は再配布条件の確認のため収録していません。下記の出典（原典）を参照してください。
          </p>
        )}
      </section>

      {/* 4. 技術説明 */}
      {concept.technicalNoteJa && (
        <section aria-labelledby="technical-heading">
          <h2 id="technical-heading" className="font-semibold text-slate-800">
            🔧 技術メモ
          </h2>
          <p className="mt-1 text-slate-700">{concept.technicalNoteJa}</p>
        </section>
      )}

      {/* 5. 関連語・継承 */}
      {relations.length > 0 && (
        <section aria-labelledby="relations-heading">
          <h2 id="relations-heading" className="font-semibold text-slate-800">
            🧩 関連する概念
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {relations.map((relation) => (
              <li
                key={`${relation.relationType}:${relation.targetConceptId}`}
                className="rounded border border-slate-200 bg-white p-3"
              >
                <Badge>
                  {RELATION_LABELS[relation.relationType] ?? relation.relationType}
                </Badge>{" "}
                <Link
                  to={`/concepts/${relation.targetConceptId}`}
                  className="font-medium text-blue-700 underline-offset-2 hover:underline"
                >
                  {relation.targetName}
                </Link>
                {relation.targetSummaryJa && (
                  <p className="mt-1 text-sm text-slate-600 line-clamp-1">
                    {relation.targetSummaryJa}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 6. よくある誤解 */}
      {concept.commonMisunderstanding && (
        <section
          aria-labelledby="misunderstanding-heading"
          className="rounded border border-amber-300 bg-amber-50 p-3"
        >
          <h2 id="misunderstanding-heading" className="font-semibold text-amber-900">
            ⚠️ よくある誤解
          </h2>
          <p className="mt-1 text-amber-900">{concept.commonMisunderstanding}</p>
        </section>
      )}

      {/* 8. 出典・ライセンス・最終確認日時 */}
      <section
        aria-labelledby="source-heading"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 id="source-heading" className="font-semibold text-slate-800">
          🔗 出典
        </h2>
        <dl className="mt-2 grid gap-1 text-sm text-slate-700">
          <div>
            <dt className="inline text-slate-500">発行主体:</dt>{" "}
            <dd className="inline">{concept.source.publisher}</dd>
          </div>
          <div>
            <dt className="inline text-slate-500">文書:</dt>{" "}
            <dd className="inline">{concept.source.documentName}</dd>
          </div>
          <div>
            <dt className="inline text-slate-500">版:</dt>{" "}
            <dd className="inline">{concept.source.versionLabel}</dd>
          </div>
          <div>
            <dt className="inline text-slate-500">取得日時:</dt>{" "}
            <dd className="inline">
              {new Date(concept.source.retrievedAt).toLocaleString("ja-JP")}
            </dd>
          </div>
          <div>
            <dt className="inline text-slate-500">原典:</dt>{" "}
            <dd className="inline">
              <a
                href={concept.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 underline"
              >
                {concept.source.url}
              </a>
            </dd>
          </div>
        </dl>
      </section>
    </article>
  );
}
