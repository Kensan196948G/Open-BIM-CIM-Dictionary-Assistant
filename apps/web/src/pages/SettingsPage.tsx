import { useEffect, useState } from "react";
import type { SystemInfo } from "@obcda/contracts";

import { Badge } from "../components/Badge";
import { ApiError, fetchSystemInfo } from "../lib/api";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "../lib/settings";

type InfoState =
  | { kind: "loading" }
  | { kind: "loaded"; info: SystemInfo }
  | { kind: "error"; message: string };

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [infoState, setInfoState] = useState<InfoState>({ kind: "loading" });

  useEffect(() => {
    setSettings(loadSettings());
    let cancelled = false;
    fetchSystemInfo()
      .then((response) => {
        if (!cancelled) setInfoState({ kind: "loaded", info: response.data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setInfoState({
          kind: "error",
          message:
            error instanceof ApiError
              ? error.message
              : "システム情報を取得できませんでした。",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update(next: AppSettings) {
    setSettings(next);
    saveSettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">⚙️ システム設定</h1>

      <section
        aria-labelledby="prefs-heading"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 id="prefs-heading" className="font-semibold text-slate-800">
          表示設定（この端末にのみ保存されます）
        </h2>
        <div className="mt-3 flex flex-col gap-4">
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">
              AI 回答の説明レベル（既定値）
            </legend>
            <div className="mt-1 flex gap-4">
              {(
                [
                  ["beginner", "初心者向け"],
                  ["technical", "技術者向け"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name="explanationLevel"
                    value={value}
                    checked={settings.explanationLevel === value}
                    onChange={() => update({ ...settings, explanationLevel: value })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="search-limit"
              className="text-sm font-medium text-slate-700"
            >
              検索結果の表示件数（1〜100）
            </label>
            <input
              id="search-limit"
              type="number"
              min={1}
              max={100}
              value={settings.searchLimit}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value >= 1 && value <= 100) {
                  update({ ...settings, searchLimit: value });
                }
              }}
              className="mt-1 w-28 rounded-md border border-slate-300 px-2 py-1"
            />
          </div>

          <p role="status" className="text-sm text-green-700">
            {saved ? "✅ 保存しました" : " "}
          </p>
        </div>
      </section>

      <section
        aria-labelledby="sysinfo-heading"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 id="sysinfo-heading" className="font-semibold text-slate-800">
          📊 システム情報
        </h2>
        {infoState.kind === "loading" && (
          <p role="status" className="mt-2 text-slate-600">
            ⏳ 読み込んでいます…
          </p>
        )}
        {infoState.kind === "error" && (
          <p role="alert" className="mt-2 text-red-700">
            ⚠️ {infoState.message}
          </p>
        )}
        {infoState.kind === "loaded" && (
          <dl className="mt-2 grid gap-1 text-sm text-slate-700">
            <div>
              <dt className="inline text-slate-500">バージョン:</dt>{" "}
              <dd className="inline">{infoState.info.version}</dd>
            </div>
            <div>
              <dt className="inline text-slate-500">データ基盤:</dt>{" "}
              <dd className="inline">
                <Badge>
                  {infoState.info.environment === "fixtures"
                    ? "サンプル辞書（fixtures）"
                    : "データベース"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="inline text-slate-500">AI プロバイダー:</dt>{" "}
              <dd className="inline">
                <Badge>
                  {infoState.info.llmProvider === "noop"
                    ? "未接続（根拠提示のみ）"
                    : infoState.info.llmProvider}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="inline text-slate-500">収録:</dt>{" "}
              <dd className="inline">
                概念 {infoState.info.counts.publishedConcepts}/
                {infoState.info.counts.concepts} 件（公開/全体）・情報源{" "}
                {infoState.info.counts.sources} 件
              </dd>
            </div>
            <div>
              <dt className="inline text-slate-500">API 起動時刻:</dt>{" "}
              <dd className="inline">
                {new Date(infoState.info.startedAt).toLocaleString("ja-JP")}
              </dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}
