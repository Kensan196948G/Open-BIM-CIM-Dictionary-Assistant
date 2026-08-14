import { useCallback, useEffect, useState } from "react";
import type {
  ReviewQueueItem,
  SourceSummary,
  SourceVersionSummary,
} from "@obcda/contracts";

import { Card, Chip, LoadingCard, TonePill, type Tone } from "../components/ui";
import {
  ApiError,
  decideReview,
  exportDictionaryUrl,
  fetchReviewQueue,
  fetchSourceVersions,
  fetchSources,
} from "../lib/api";
import { formatDateTimeJa, licenseStatusLabel } from "../lib/labels";
import { usePageMeta } from "../lib/topbar";

type SourceRow = SourceSummary & { latestVersion: SourceVersionSummary | null };

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; rows: SourceRow[] }
  | { kind: "error"; message: string };

type QueueState =
  | { kind: "loading" }
  | { kind: "loaded"; items: ReviewQueueItem[] }
  | { kind: "error"; message: string };

const REVIEW_TONES: Record<ReviewQueueItem["status"], { tone: Tone; label: string }> = {
  pending: { tone: "warn", label: "レビュー待ち" },
  approved: { tone: "ok", label: "公開済み" },
  rejected: { tone: "danger", label: "却下" },
};

const KIND_LABELS: Record<ReviewQueueItem["kind"], string> = {
  new_concept: "新規概念",
  version_update: "版更新",
};

const TH_CLASS =
  "border-b border-line-soft bg-panel px-4 py-[11px] text-left text-[11px] font-semibold text-faint";
const TD_CLASS = "border-b border-line-soft px-4 py-3";

export function SourcesPage() {
  usePageMeta("出典・取り込み管理", "差分レビュー・品質警告・公開/ロールバック");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [queueState, setQueueState] = useState<QueueState>({ kind: "loading" });
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    fetchSources()
      .then(async (response) => {
        const rows = await Promise.all(
          response.data.map(async (source) => {
            const versions = await fetchSourceVersions(source.id)
              .then((v) => v.data)
              .catch(() => []);
            return { ...source, latestVersion: versions[0] ?? null };
          }),
        );
        if (!cancelled) setState({ kind: "loaded", rows });
      })
      .catch(() => {
        if (!cancelled)
          setState({ kind: "error", message: "情報源一覧の取得に失敗しました。" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  useEffect(() => {
    let cancelled = false;
    fetchReviewQueue()
      .then((response) => {
        if (!cancelled) setQueueState({ kind: "loaded", items: response.data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setQueueState({
          kind: "error",
          message:
            error instanceof ApiError
              ? error.message
              : "レビューキューの取得に失敗しました。",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const decide = (id: string, decision: "approved" | "rejected") => {
    setDecisionError(null);
    decideReview(id, decision)
      .then((response) => {
        setQueueState((prev) => {
          if (prev.kind !== "loaded") return prev;
          return {
            kind: "loaded",
            items: prev.items.map((item) =>
              item.id === response.data.id ? response.data : item,
            ),
          };
        });
      })
      .catch((error: unknown) => {
        setDecisionError(
          error instanceof ApiError
            ? error.message
            : "レビュー判定の保存に失敗しました。",
        );
      });
  };

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-[18px] py-[15px]">
          <div className="text-[14px] font-semibold text-ink">📚 情報源一覧</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-faint">📦 公開辞書エクスポート:</span>
            <a
              href={exportDictionaryUrl("json")}
              download
              className="rounded-[7px] border border-link-line bg-white px-3 py-1.5 text-[12px] font-semibold text-link"
            >
              JSON
            </a>
            <a
              href={exportDictionaryUrl("csv")}
              download
              className="rounded-[7px] border border-link-line bg-white px-3 py-1.5 text-[12px] font-semibold text-link"
            >
              CSV
            </a>
          </div>
        </div>
        {state.kind === "loading" && (
          <div className="p-4">
            <LoadingCard label="⏳ 読み込んでいます…" />
          </div>
        )}
        {state.kind === "error" && (
          <p role="alert" className="m-0 p-4 text-[13px] text-danger">
            ⚠️ {state.message}
          </p>
        )}
        {state.kind === "loaded" && (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className={TH_CLASS}>情報源</th>
                  <th className={TH_CLASS}>発行主体</th>
                  <th className={TH_CLASS}>版</th>
                  <th className={TH_CLASS}>取得日時</th>
                  <th className={TH_CLASS}>ライセンス</th>
                  <th className={TH_CLASS}>種別</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((row) => (
                  <tr key={row.id}>
                    <td className={`${TD_CLASS} font-medium text-ink`}>{row.nameJa}</td>
                    <td className={`${TD_CLASS} text-sub`}>{row.publisher}</td>
                    <td className={`${TD_CLASS} text-sub`}>
                      {row.latestVersion?.versionLabel ?? "—"}
                    </td>
                    <td className={`${TD_CLASS} text-sub`}>
                      {row.latestVersion
                        ? formatDateTimeJa(row.latestVersion.retrievedAt)
                        : "—"}
                    </td>
                    <td className={`${TD_CLASS} text-sub`}>
                      {licenseStatusLabel(row.licenseStatus)}
                    </td>
                    <td className={`${TD_CLASS} text-sub`}>{row.sourceType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-[18px]">
        <h2 className="mt-0 mb-1.5 text-[14px] font-semibold text-ink">
          🔄 取り込み・公開フロー
        </h2>
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-sub">
          <span className="rounded-[20px] bg-chip px-2.5 py-1">取得</span>→
          <span className="rounded-[20px] bg-chip px-2.5 py-1">Draft</span>→
          <span className="rounded-[20px] bg-warn-soft px-2.5 py-1 text-warn">
            Review
          </span>
          →
          <span className="rounded-[20px] bg-ok-soft px-2.5 py-1 text-ok">
            Published
          </span>
          →<span className="rounded-[20px] bg-chip px-2.5 py-1">Archived</span>
        </div>
      </Card>

      <Card className="p-[18px]">
        <h2 className="mt-0 mb-3 text-[14px] font-semibold text-ink">
          🛠️ 差分レビュー キュー
          <span className="ml-2 align-middle text-[11px] font-medium text-faint">
            承認・却下は管理 API 経由で記録され、変更監査（S4）に残ります
          </span>
        </h2>

        {decisionError && (
          <p
            role="alert"
            className="m-0 mb-3 rounded-[10px] border border-danger-line bg-danger-soft p-3 text-[13px] text-danger"
          >
            ⚠️ {decisionError}
          </p>
        )}

        {queueState.kind === "loading" && (
          <div className="p-2">
            <LoadingCard label="⏳ レビューキューを読み込んでいます…" />
          </div>
        )}
        {queueState.kind === "error" && (
          <p role="alert" className="m-0 text-[13px] text-danger">
            ⚠️ {queueState.message}
          </p>
        )}
        {queueState.kind === "loaded" && queueState.items.length === 0 && (
          <p role="status" className="m-0 text-[13px] text-faint">
            レビュー待ちの項目はありません。
          </p>
        )}
        {queueState.kind === "loaded" && queueState.items.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {queueState.items.map((item) => {
              const tone = REVIEW_TONES[item.status];
              return (
                <div
                  key={item.id}
                  className="rounded-lg border border-line-soft px-4 py-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">
                        {item.name}
                      </span>
                      <Chip>{KIND_LABELS[item.kind] ?? item.kind}</Chip>
                      <Chip>{item.standardFamily}</Chip>
                    </div>
                    <TonePill tone={tone.tone}>{tone.label}</TonePill>
                  </div>
                  <p className="mt-2 mb-0 text-[12.5px] text-sub">{item.reason}</p>
                  {item.warnings.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {item.warnings.map((warning) => (
                        <span
                          key={warning}
                          className="rounded-md border border-danger-line bg-danger-soft px-2 py-[2px] text-[11px] font-semibold text-danger"
                        >
                          ⚠️ {warning}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.status === "pending" && (
                    <div className="mt-2.5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => decide(item.id, "approved")}
                        className="cursor-pointer rounded-[7px] border border-ok bg-ok px-[13px] py-1.5 font-sans text-[12px] font-semibold text-white"
                      >
                        ✅ 承認・公開
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(item.id, "rejected")}
                        className="cursor-pointer rounded-[7px] border border-danger-line bg-white px-[13px] py-1.5 font-sans text-[12px] font-semibold text-danger"
                      >
                        ✕ 却下
                      </button>
                    </div>
                  )}
                  {item.status !== "pending" && item.decidedBy && (
                    <p className="mt-2 mb-0 text-[11.5px] text-faint">
                      判定: {item.decidedBy} ・ {item.decidedAt ?? ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
