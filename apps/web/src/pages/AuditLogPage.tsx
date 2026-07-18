import { useCallback, useEffect, useState } from "react";
import type { AuditEvent } from "@obcda/contracts";
import { StatusPill, type StatusTone } from "@obcda/ui";

import { ApiError, fetchAuditEvents } from "../lib/api";

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; events: AuditEvent[] }
  | { kind: "error"; message: string };

function statusTone(status: number): StatusTone {
  if (status >= 500) return "error";
  if (status >= 400) return "warning";
  return "success";
}

export function AuditLogPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const reload = useCallback(() => {
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
    reload();
  }, [reload]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">📋 監査ログ</h1>
        <button
          type="button"
          onClick={reload}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:border-blue-600 hover:text-blue-700 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
        >
          🔄 再読み込み
        </button>
      </div>

      <p className="text-sm text-slate-600">
        API リクエストの記録です。プライバシー保護のため、検索語・質問文・IP
        アドレスは記録されません（メソッド・パス・結果・所要時間のみ）。現在はメモリ上の記録のため、API
        再起動でリセットされます。
      </p>

      {state.kind === "loading" && (
        <p role="status" className="text-slate-600">
          ⏳ 読み込んでいます…
        </p>
      )}

      {state.kind === "error" && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-red-800"
        >
          ⚠️ {state.message}
        </p>
      )}

      {state.kind === "loaded" && state.events.length === 0 && (
        <p role="status" className="rounded border border-slate-200 bg-white p-4">
          記録がまだありません。検索や用語閲覧を行うとここに表示されます。
        </p>
      )}

      {state.kind === "loaded" && state.events.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">API リクエストの監査ログ（新しい順）</caption>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                <th scope="col" className="px-3 py-2 font-medium">
                  日時
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  メソッド
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  パス
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  結果
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  所要
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  リクエストID
                </th>
              </tr>
            </thead>
            <tbody>
              {state.events.map((event) => (
                <tr key={event.id} className="border-b border-slate-100">
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-700">
                    {new Date(event.occurredAt).toLocaleString("ja-JP")}
                  </td>
                  <td className="px-3 py-1.5 font-mono">{event.method}</td>
                  <td className="px-3 py-1.5 font-mono text-slate-700">{event.path}</td>
                  <td className="px-3 py-1.5">
                    <StatusPill tone={statusTone(event.status)}>
                      {event.status}
                    </StatusPill>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-700">
                    {event.durationMs} ms
                  </td>
                  <td
                    className="max-w-40 truncate px-3 py-1.5 font-mono text-xs text-slate-500"
                    title={event.requestId}
                  >
                    {event.requestId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
