import { useEffect, useState } from "react";
import type { SourceSummary, SourceVersionSummary } from "@obcda/contracts";

import { Card, Chip, LoadingCard, TonePill } from "../components/ui";
import { fetchSourceVersions, fetchSources } from "../lib/api";
import { formatDateTimeJa, licenseStatusLabel } from "../lib/labels";
import { usePageMeta } from "../lib/topbar";

type SourceRow = SourceSummary & { latestVersion: SourceVersionSummary | null };

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; rows: SourceRow[] }
  | { kind: "error"; message: string };

/**
 * 差分レビューキューはプロトタイプ同梱のサンプル表示。
 * 取り込みの DB 実記録（Issue #29）が入り次第、実データへ切り替える。
 */
const SAMPLE_REVIEW_QUEUE = [
  {
    id: "rq1",
    name: "IfcCulvert",
    kind: "新規概念",
    standardFamily: "IFC",
    reason: "IFC4.3.2.0 スキーマ差分を検出しました",
    warnings: ["出典URLの再配布条件が未確認"],
  },
  {
    id: "rq2",
    name: "IfcRoad",
    kind: "版更新",
    standardFamily: "IFC",
    reason: "summaryJa の文言差分を検出しました",
    warnings: [] as string[],
  },
  {
    id: "rq3",
    name: "IDS",
    kind: "版更新",
    standardFamily: "IDS",
    reason: "sourceVersionId の更新を検出しました(2026-07 → 2026-11 予定)",
    warnings: ["取得日時が未設定"],
  },
];

type ReviewState = "pending" | "approved" | "rejected";

const REVIEW_TONES: Record<
  ReviewState,
  { tone: "warn" | "ok" | "danger"; label: string }
> = {
  pending: { tone: "warn", label: "レビュー待ち" },
  approved: { tone: "ok", label: "公開済み" },
  rejected: { tone: "danger", label: "却下" },
};

const TH_CLASS =
  "border-b border-line-soft bg-panel px-4 py-[11px] text-left text-[11px] font-semibold text-faint";
const TD_CLASS = "border-b border-line-soft px-4 py-3";

export function SourcesPage() {
  usePageMeta("出典・取り込み管理", "差分レビュー・品質警告・公開/ロールバック");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reviewStates, setReviewStates] = useState<Record<string, ReviewState>>({});

  useEffect(() => {
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

  return (
    <>
      <Card className="overflow-hidden">
        <div className="border-b border-line-soft px-[18px] py-[15px]">
          <div className="text-[14px] font-semibold text-ink">📚 情報源一覧</div>
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
            サンプル表示（取り込みの実記録 #29 実装後に実データ化）
          </span>
        </h2>
        <div className="flex flex-col gap-2.5">
          {SAMPLE_REVIEW_QUEUE.map((item) => {
            const reviewState = reviewStates[item.id] ?? "pending";
            const tone = REVIEW_TONES[reviewState];
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
                    <Chip>{item.kind}</Chip>
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
                {reviewState === "pending" && (
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setReviewStates((prev) => ({ ...prev, [item.id]: "approved" }))
                      }
                      className="cursor-pointer rounded-[7px] border border-ok bg-ok px-[13px] py-1.5 font-sans text-[12px] font-semibold text-white"
                    >
                      ✅ 承認・公開
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setReviewStates((prev) => ({ ...prev, [item.id]: "rejected" }))
                      }
                      className="cursor-pointer rounded-[7px] border border-danger-line bg-white px-[13px] py-1.5 font-sans text-[12px] font-semibold text-danger"
                    >
                      ✕ 却下
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
