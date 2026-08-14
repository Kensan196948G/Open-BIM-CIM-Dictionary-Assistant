import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type {
  ConceptDetail,
  ConceptDetailResponse,
  ConceptRelation,
  ConceptRelationsResponse,
} from "@obcda/contracts";

import { Card, Chip, GhostButton, LoadingCard } from "../components/ui";
import { ApiError, fetchConcept, fetchRelations } from "../lib/api";
import { useCompare } from "../lib/compare";
import {
  LABEL_TYPE_LABELS,
  RELATION_GROUP_LABELS,
  conceptStatusLabel,
  formatDateTimeJa,
} from "../lib/labels";
import { usePageMeta } from "../lib/topbar";

type LoadState =
  | { kind: "loading" }
  | {
      kind: "loaded";
      detail: ConceptDetailResponse;
      relations: ConceptRelationsResponse;
    }
  | { kind: "error"; message: string; notFound: boolean };

function groupRelations(relations: ConceptRelation[]) {
  const groups: { type: string; label: string; items: ConceptRelation[] }[] = [];
  const byType = new Map<string, (typeof groups)[number]>();
  for (const relation of relations) {
    let group = byType.get(relation.relationType);
    if (!group) {
      group = {
        type: relation.relationType,
        label: RELATION_GROUP_LABELS[relation.relationType] ?? relation.relationType,
        items: [],
      };
      byType.set(relation.relationType, group);
      groups.push(group);
    }
    group.items.push(relation);
  }
  return groups;
}

export function ConceptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const compare = useCompare();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const concept = state.kind === "loaded" ? state.detail.data : null;
  usePageMeta(
    concept ? concept.name : "用語詳細",
    concept ? `${concept.standardFamily} ・ 版 ${concept.version}` : "",
  );

  useEffect(() => {
    if (!id) {
      setState({
        kind: "error",
        message: "用語IDが指定されていません。",
        notFound: true,
      });
      return;
    }
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
    return <LoadingCard label="⏳ 読み込んでいます…" />;
  }

  if (state.kind === "error") {
    return (
      <div
        role="alert"
        className="rounded-[10px] border border-danger-line bg-danger-soft p-4"
      >
        <p className="m-0 text-[13px] text-danger">⚠️ {state.message}</p>
        <Link to="/" className="mt-2 inline-block text-[13px] font-semibold text-link">
          ホームへ戻る
        </Link>
      </div>
    );
  }

  const detail = state.detail.data;
  const relations = state.relations.data;
  const relationGroups = groupRelations(relations);
  const inherits = relations.find((relation) => relation.relationType === "inherits");
  const inCompare = compare.has(detail.id);

  return (
    <article className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h2 className="m-0 text-[22px] font-bold text-ink">{detail.name}</h2>
          <GhostButton
            type="button"
            onClick={() => compare.toggle(detail.id)}
            disabled={!inCompare && compare.isFull}
            className="px-[13px] py-[7px] text-[12.5px] !text-sub"
          >
            {inCompare ? "✓ 比較に追加済み" : "＋ 比較に追加"}
          </GhostButton>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Chip>{detail.standardFamily}</Chip>
          <Chip>{detail.conceptType}</Chip>
          <Chip>版: {detail.version}</Chip>
          <Chip>{conceptStatusLabel(detail.status)}</Chip>
        </div>
        {detail.labels.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-[18px] gap-y-1.5 text-[12.5px] text-sub">
            {detail.labels.map((label) => (
              <div key={`${label.labelType}:${label.language}:${label.label}`}>
                <span className="text-faint">
                  {LABEL_TYPE_LABELS[label.labelType] ?? label.labelType} (
                  {label.language}):
                </span>{" "}
                {label.label}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-[18px]">
        <h2 className="m-0 text-[14px] font-semibold text-ink">📘 やさしい説明</h2>
        <p className="mt-2 mb-0 text-[13.5px] leading-[1.7] text-sub">
          {detail.summaryJa ?? "—"}
        </p>
      </Card>

      <Card className="p-[18px]">
        <h2 className="m-0 text-[14px] font-semibold text-ink">📖 公式定義</h2>
        {detail.officialDefinition ? (
          <p className="mt-2 mb-0 text-[13.5px] leading-[1.7] text-sub">
            {detail.officialDefinition}
          </p>
        ) : (
          <p className="mt-2 mb-0 text-[13px] leading-[1.7] text-faint">
            公式定義の本文は再配布条件の確認のため収録していません。下記の出典（原典）を参照してください。
          </p>
        )}
      </Card>

      {detail.technicalNoteJa && (
        <Card className="p-[18px]">
          <h2 className="m-0 text-[14px] font-semibold text-ink">🔧 技術メモ</h2>
          <p className="mt-2 mb-0 text-[13.5px] leading-[1.7] text-sub">
            {detail.technicalNoteJa}
          </p>
        </Card>
      )}

      {detail.conceptType === "entity" && (
        <Card className="p-[18px]">
          <h2 className="m-0 text-[14px] font-semibold text-ink">🧩 IFC詳細</h2>
          {inherits && (
            <p className="mt-2 mb-0 text-[13px] text-sub">
              継承元:{" "}
              <Link
                to={`/concepts/${inherits.targetConceptId}`}
                className="cursor-pointer font-semibold text-link"
              >
                {inherits.targetName}
              </Link>
            </p>
          )}
          <p className="mt-2 mb-0 text-[12px] text-faint">
            Pset / Qto: 本サンプルデータには未収録です（取り込み実装後に追加予定）。
          </p>
        </Card>
      )}

      {relationGroups.length > 0 && (
        <Card className="p-[18px]">
          <h2 className="mt-0 mb-2.5 text-[14px] font-semibold text-ink">
            🧩 関連する概念
          </h2>
          <div className="flex flex-col gap-2.5">
            {relationGroups.map((group) => (
              <div key={group.type}>
                <div className="mb-1.5 text-[11.5px] font-semibold text-faint">
                  {group.label}
                </div>
                <div className="flex flex-col gap-1.5">
                  {group.items.map((relation) => (
                    <div
                      key={`${relation.relationType}:${relation.targetConceptId}`}
                      className="rounded-lg border border-line-soft px-3 py-2.5"
                    >
                      <Link
                        to={`/concepts/${relation.targetConceptId}`}
                        className="cursor-pointer text-[13px] font-semibold text-link"
                      >
                        {relation.targetName}
                      </Link>
                      {relation.targetSummaryJa && (
                        <p className="mt-1 mb-0 text-[12px] text-faint">
                          {relation.targetSummaryJa}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {detail.commonMisunderstanding && (
        <section className="rounded-[10px] border border-warn-line bg-warn-soft p-[18px]">
          <h2 className="m-0 text-[14px] font-semibold text-warn">⚠️ よくある誤解</h2>
          <p className="mt-2 mb-0 text-[13.5px] leading-[1.7] text-warn-deep">
            {detail.commonMisunderstanding}
          </p>
        </section>
      )}

      <Card className="p-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="mt-0 mb-2.5 text-[14px] font-semibold text-ink">🔗 出典</h2>
          <CitationCopyButton detail={detail} />
        </div>
        <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-[13px] text-ink">
          <dt className="text-faint">発行主体</dt>
          <dd className="m-0">{detail.source.publisher}</dd>
          <dt className="text-faint">文書</dt>
          <dd className="m-0">{detail.source.documentName}</dd>
          <dt className="text-faint">版</dt>
          <dd className="m-0">{detail.source.versionLabel}</dd>
          <dt className="text-faint">取得日時</dt>
          <dd className="m-0">{formatDateTimeJa(detail.source.retrievedAt)}</dd>
          <dt className="text-faint">原典</dt>
          <dd className="m-0">
            <a
              href={detail.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link break-all"
            >
              {detail.source.url}
            </a>
          </dd>
        </dl>
      </Card>
    </article>
  );
}

/**
 * FR-009: 引用情報のワンクリックコピー。
 * 「用語（版）— 発行主体・文書 — 原典 URL」形式でクリップボードへ。
 */
function CitationCopyButton({ detail }: { detail: ConceptDetail }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const citation = `「${detail.name}」— ${detail.standardFamily} ${detail.version}（${detail.source.publisher}・${detail.source.documentName}）\n${detail.source.url}`;
    try {
      await navigator.clipboard.writeText(citation);
      setCopied(true);
    } catch {
      // clipboard API が使えない場合は selection ベースにフォールバック
      const textarea = document.createElement("textarea");
      textarea.value = citation;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
    }
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <GhostButton
      type="button"
      onClick={copy}
      className="px-[11px] py-[5px] text-[12px] !text-sub"
    >
      {copied ? "✅ コピーしました" : "📋 引用をコピー"}
    </GhostButton>
  );
}
