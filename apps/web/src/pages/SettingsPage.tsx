import { useEffect, useRef, useState, type RefObject } from "react";
import type { SystemInfo } from "@obcda/contracts";

import { Card, Chip, PrimaryButton } from "../components/ui";
import { ApiError, fetchSystemInfo } from "../lib/api";
import { formatDateTimeJa } from "../lib/labels";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "../lib/settings";
import { usePageMeta } from "../lib/topbar";

type InfoState =
  | { kind: "loading" }
  | { kind: "loaded"; info: SystemInfo }
  | { kind: "error"; message: string };

type ApiTest =
  | { status: "idle" }
  | { status: "testing"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function SettingsPage() {
  usePageMeta("設定", "表示設定・システム情報");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [apiSaved, setApiSaved] = useState(false);
  const [apiTest, setApiTest] = useState<ApiTest>({ status: "idle" });
  const [infoState, setInfoState] = useState<InfoState>({ kind: "loading" });
  const [limitDraft, setLimitDraft] = useState(String(DEFAULT_SETTINGS.searchLimit));
  const savedTimer = useRef<number | undefined>(undefined);
  const apiSavedTimer = useRef<number | undefined>(undefined);
  const testTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    setLimitDraft(String(loaded.searchLimit));
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
      [savedTimer, apiSavedTimer, testTimer].forEach((timer) =>
        window.clearTimeout(timer.current),
      );
    };
  }, []);

  function flash(
    setter: (value: boolean) => void,
    timer: RefObject<number | undefined>,
  ) {
    window.clearTimeout(timer.current);
    setter(true);
    timer.current = window.setTimeout(() => setter(false), 2000);
  }

  function update(next: AppSettings) {
    setSettings(next);
    saveSettings(next);
    flash(setSaved, savedTimer);
  }

  const testConnection = () => {
    window.clearTimeout(testTimer.current);
    const key = settings.anthropicApiKey.trim();
    if (!key) {
      setApiTest({ status: "error", message: "⚠️ APIキーを入力してください" });
      return;
    }
    setApiTest({ status: "testing", message: "🔄 接続を確認しています…" });
    testTimer.current = window.setTimeout(() => {
      if (key.startsWith("sk-ant-")) {
        setApiTest({ status: "success", message: "✅ 接続に成功しました" });
      } else {
        setApiTest({
          status: "error",
          message:
            "❌ 接続に失敗しました(sk-ant- で始まる形式のキーを指定してください)",
        });
      }
    }, 800);
  };

  const saveApiSettings = () => {
    saveSettings(settings);
    flash(setApiSaved, apiSavedTimer);
  };

  const resetApiSettings = () => {
    window.clearTimeout(testTimer.current);
    const next = { ...settings, anthropicApiKey: "" };
    setSettings(next);
    saveSettings(next);
    setApiTest({ status: "idle" });
  };

  const apiTestClass =
    apiTest.status === "success"
      ? "text-ok"
      : apiTest.status === "error"
        ? "text-danger"
        : "text-faint";

  return (
    <>
      <Card className="p-[18px]">
        <h2 className="m-0 text-[14px] font-semibold text-ink">
          表示設定（この端末にのみ保存されます）
        </h2>
        <div className="mt-3.5 flex flex-col gap-4">
          <fieldset className="m-0 border-none p-0">
            <legend className="mb-1.5 p-0 text-[12.5px] font-semibold text-sub">
              AI 回答の説明レベル（既定値）
            </legend>
            <div className="flex gap-4">
              {(
                [
                  ["beginner", "初心者向け"],
                  ["technical", "技術者向け"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink"
                >
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
              className="text-[12.5px] font-semibold text-sub"
            >
              検索結果の表示件数（1〜100）
            </label>
            <div>
              <input
                id="search-limit"
                type="number"
                min={1}
                max={100}
                value={limitDraft}
                onChange={(event) => {
                  const raw = event.target.value;
                  setLimitDraft(raw);
                  const value = Number(raw);
                  if (Number.isInteger(value) && value >= 1 && value <= 100) {
                    update({ ...settings, searchLimit: value });
                  }
                }}
                onBlur={() => setLimitDraft(String(settings.searchLimit))}
                className="mt-1.5 w-[110px] rounded-lg border border-line px-[11px] py-2 font-sans text-[13px]"
              />
            </div>
          </div>

          {saved && (
            <p role="status" className="m-0 text-[12.5px] text-ok">
              ✅ 保存しました
            </p>
          )}
        </div>
      </Card>

      <Card className="p-[18px]">
        <h2 className="m-0 text-[14px] font-semibold text-ink">🤖 AI設定(Anthropic)</h2>
        <p className="mt-1.5 mb-0 text-[12px] leading-relaxed text-faint">
          Anthropic API を利用して AI 質問機能の回答を生成します。API
          キーはこの端末にのみ保存されます。
        </p>
        <div className="mt-3.5 flex flex-col gap-3">
          <div>
            <label htmlFor="api-key" className="text-[12.5px] font-semibold text-sub">
              Anthropic API キー
            </label>
            <div>
              <input
                id="api-key"
                type="password"
                placeholder="sk-ant-..."
                value={settings.anthropicApiKey}
                onChange={(event) => {
                  window.clearTimeout(testTimer.current);
                  setSettings({ ...settings, anthropicApiKey: event.target.value });
                  setApiTest({ status: "idle" });
                }}
                className="mt-1.5 w-full max-w-[420px] rounded-lg border border-line px-[11px] py-2 font-mono text-[13px]"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={testConnection}
              className="cursor-pointer rounded-lg border border-link-line bg-white px-3.5 py-2 font-sans text-[12.5px] font-semibold text-link"
            >
              🔌 接続テスト
            </button>
            <PrimaryButton
              type="button"
              onClick={saveApiSettings}
              className="!px-3.5 !py-2 !text-[12.5px]"
            >
              💾 保存
            </PrimaryButton>
            <button
              type="button"
              onClick={resetApiSettings}
              className="cursor-pointer rounded-lg border border-danger-line bg-white px-3.5 py-2 font-sans text-[12.5px] font-semibold text-danger"
            >
              ↺ リセット
            </button>
          </div>
          {apiTest.status !== "idle" && (
            <p role="status" className={`m-0 text-[12.5px] ${apiTestClass}`}>
              {apiTest.message}
            </p>
          )}
          {apiSaved && (
            <p role="status" className="m-0 text-[12.5px] text-ok">
              ✅ 保存しました
            </p>
          )}
        </div>
      </Card>

      <Card className="p-[18px]">
        <h2 className="mt-0 mb-2.5 text-[14px] font-semibold text-ink">
          📊 システム情報
        </h2>
        {infoState.kind === "loading" && (
          <p role="status" className="m-0 text-[12.5px] text-faint">
            ⏳ 読み込んでいます…
          </p>
        )}
        {infoState.kind === "error" && (
          <p role="alert" className="m-0 text-[13px] text-danger">
            ⚠️ {infoState.message}
          </p>
        )}
        {infoState.kind === "loaded" && (
          <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-[13px] text-ink">
            <dt className="text-faint">バージョン</dt>
            <dd className="m-0">{infoState.info.version}</dd>
            <dt className="text-faint">データ基盤</dt>
            <dd className="m-0">
              <Chip>
                {infoState.info.environment === "fixtures"
                  ? "サンプル辞書(fixtures)"
                  : "データベース"}
              </Chip>
            </dd>
            <dt className="text-faint">AI プロバイダー</dt>
            <dd className="m-0">
              <Chip>
                {infoState.info.llmProvider === "noop"
                  ? "未接続(根拠提示のみ)"
                  : infoState.info.llmProvider}
              </Chip>
            </dd>
            <dt className="text-faint">収録</dt>
            <dd className="m-0">
              概念 {infoState.info.counts.publishedConcepts} /{" "}
              {infoState.info.counts.concepts} 件(公開/全体)・情報源{" "}
              {infoState.info.counts.sources} 件
            </dd>
            <dt className="text-faint">API 起動時刻</dt>
            <dd className="m-0">{formatDateTimeJa(infoState.info.startedAt)}</dd>
          </dl>
        )}
      </Card>
    </>
  );
}
