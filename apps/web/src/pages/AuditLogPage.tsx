import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditEvent } from "@obcda/contracts";

import { Card, GhostButton, TonePill, type Tone } from "../components/ui";
import { ApiError, fetchAuditEvents } from "../lib/api";
import { formatDateTimeJa } from "../lib/labels";
import { usePageMeta } from "../lib/topbar";

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; events: AuditEvent[] }
  | { kind: "error"; message: string };

function statusTone(status: number): Tone {
  if (status >= 500) return "danger";
  if (status >= 400) return "warn";
  return "ok";
}

const EXPORT_HEADER = ["日時", "メソッド", "パス", "結果", "所要(ms)", "リクエストID"];

function eventRows(events: AuditEvent[]): string[][] {
  return events.map((event) => [
    formatDateTimeJa(event.occurredAt),
    event.method,
    event.path,
    String(event.status),
    String(event.durationMs),
    event.requestId,
  ]);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildAuditHtml(events: AuditEvent[]): string {
  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const head = EXPORT_HEADER.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = eventRows(events)
    .map(
      (row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>監査ログ</title><style>body{font-family:sans-serif;font-size:12px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left;}th{background:#f4f4f4;}</style></head><body><h1>監査ログ</h1><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

export function AuditLogPage() {
  usePageMeta("監査ログ", "APIリクエストの記録(メモリ上・再起動でリセット)");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reloadFlash, setReloadFlash] = useState(false);
  const flashTimer = useRef<number>(undefined);

  const load = useCallback(() => {
    setState({ kind: "loading" });
    fetchAuditEvents(200)
      .then((response) => setState({ kind: "loaded", events: response.data }))
      .catch((error: unknown) => {
        setState({
          kind: "error",
          message:
            error instanceof ApiError
              ? error.message
              : "監査ログを取得できませんでした。",
        });
      });
  }, []);

  useEffect(() => {
    load();
    return () => window.clearTimeout(flashTimer.current);
  }, [load]);

  const reload = () => {
    load();
    setReloadFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setReloadFlash(false), 1500);
  };

  const events = state.kind === "loaded" ? state.events : [];

  const exportCsv = () => {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const csv = [EXPORT_HEADER, ...eventRows(events)]
      .map((row) => row.map(escape).join(","))
      .join("\r\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), "audit-log.csv");
  };

  const exportHtml = () => {
    downloadBlob(
      new Blob([buildAuditHtml(events)], { type: "text/html;charset=utf-8;" }),
      "audit-log.html",
    );
  };

  const exportPdf = () => {
    const blob = new Blob([buildAuditHtml(events)], {
      type: "text/html;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      const tryPrint = () => {
        try {
          win.focus();
          win.print();
        } catch {
          // print blocked — the opened tab still shows the log
        }
      };
      win.addEventListener("load", tryPrint);
    }
  };

  const TH =
    "border-b border-line-soft bg-panel px-4 py-[11px] text-left text-[11px] font-semibold text-faint";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <p className="m-0 max-w-[640px] text-[12.5px] leading-relaxed text-sub">
          API リクエストの記録です。プライバシー保護のため、検索語・質問文・IP
          アドレスは記録されません。現在はメモリ上の記録のため、再読み込みでリセットされます。
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <GhostButton
            type="button"
            onClick={exportCsv}
            className="px-3 py-2 text-[12px]"
          >
            📄 CSV
          </GhostButton>
          <GhostButton
            type="button"
            onClick={exportHtml}
            className="px-3 py-2 text-[12px]"
          >
            🌐 HTML
          </GhostButton>
          <GhostButton
            type="button"
            onClick={exportPdf}
            className="px-3 py-2 text-[12px]"
          >
            🖨️ PDF
          </GhostButton>
          <GhostButton
            type="button"
            onClick={reload}
            className="px-3.5 py-2 text-[12.5px]"
          >
            🔄 再読み込み
          </GhostButton>
        </div>
      </div>

      {reloadFlash && (
        <p role="status" className="m-0 text-[12px] text-ok">
          ✅ 再読み込みしました
        </p>
      )}

      {state.kind === "loading" && (
        <p role="status" className="m-0 text-[12.5px] text-faint">
          ⏳ 読み込んでいます…
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

      {state.kind === "loaded" && events.length === 0 && (
        <p
          role="status"
          className="m-0 rounded-[10px] border border-line bg-white p-4 text-[13px] text-faint"
        >
          記録がまだありません。検索や用語閲覧を行うとここに表示されます。
        </p>
      )}

      {state.kind === "loaded" && events.length > 0 && (
        <Card className="overflow-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <caption className="sr-only">API リクエストの監査ログ（新しい順）</caption>
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  日時
                </th>
                <th scope="col" className={TH}>
                  メソッド
                </th>
                <th scope="col" className={TH}>
                  パス
                </th>
                <th scope="col" className={TH}>
                  結果
                </th>
                <th scope="col" className={TH}>
                  所要
                </th>
                <th scope="col" className={TH}>
                  リクエストID
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="border-b border-line-soft px-4 py-2.5 whitespace-nowrap text-sub">
                    {formatDateTimeJa(event.occurredAt)}
                  </td>
                  <td className="border-b border-line-soft px-4 py-2.5 font-mono text-ink">
                    {event.method}
                  </td>
                  <td className="border-b border-line-soft px-4 py-2.5 font-mono text-[11.5px] text-sub">
                    {event.path}
                  </td>
                  <td className="border-b border-line-soft px-4 py-2.5">
                    <TonePill tone={statusTone(event.status)}>{event.status}</TonePill>
                  </td>
                  <td className="border-b border-line-soft px-4 py-2.5 whitespace-nowrap text-sub">
                    {event.durationMs} ms
                  </td>
                  <td
                    className="max-w-40 truncate border-b border-line-soft px-4 py-2.5 font-mono text-[11px] text-faint"
                    title={event.requestId}
                  >
                    {event.requestId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
