/**
 * Client-side preferences (§5.4: personal settings stay on the device).
 * Stored in localStorage — no account, nothing leaves the browser.
 * The Anthropic API key is deliberately NOT here: it is admin-managed
 * server-side (設定 → AI設定(Anthropic)) and never kept in the browser.
 */

export type AppSettings = {
  /** Default explanation level for AI answers. */
  explanationLevel: "beginner" | "technical";
  /** Search result page size (API caps at 100). */
  searchLimit: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  explanationLevel: "beginner",
  searchLimit: 20,
};

const STORAGE_KEY = "obcda.settings.v1";

export function loadSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings> & {
      anthropicApiKey?: unknown;
    };
    const level = parsed.explanationLevel === "technical" ? "technical" : "beginner";
    const limit = Number(parsed.searchLimit);
    const sanitized: AppSettings = {
      explanationLevel: level,
      searchLimit:
        Number.isInteger(limit) && limit >= 1 && limit <= 100
          ? limit
          : DEFAULT_SETTINGS.searchLimit,
    };
    // 旧バージョンで localStorage に残った API キーを読み込み時に即座に除去する
    if ("anthropicApiKey" in parsed) {
      saveSettings(sanitized);
    }
    return sanitized;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
