/**
 * 最近の検索（この端末にのみ保存 — localStorage）。
 * サーバー側は §3.3 search_events_daily にハッシュ集計のみを残し、
 * 検索語そのものは端末外へ保存しない 2 層構成の端末側。
 */

const STORAGE_KEY = "obcda.searchHistory.v1";

export const SEARCH_HISTORY_MAX = 10;

export function loadSearchHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const terms = parsed.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    return [...new Set(terms)].slice(0, SEARCH_HISTORY_MAX);
  } catch {
    return [];
  }
}

/** 先頭へ追加（重複は先頭へ移動）した後の一覧を返す。 */
export function addSearchHistory(term: string): string[] {
  const trimmed = term.trim();
  const current = loadSearchHistory();
  if (!trimmed) return current;
  const next = [trimmed, ...current.filter((value) => value !== trimmed)].slice(
    0,
    SEARCH_HISTORY_MAX,
  );
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode) — history is best-effort
  }
  return next;
}

export function clearSearchHistory(): string[] {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return [];
}
