/**
 * Client-side preferences (§5.4: MVP keeps personal settings on the device).
 * Stored in localStorage — no account, nothing leaves the browser.
 */

export type AppSettings = {
  /** Default explanation level for AI answers. */
  explanationLevel: "beginner" | "technical";
  /** Search result page size (API caps at 100). */
  searchLimit: number;
  /** Anthropic API key for the AI answer feature — kept on this device only. */
  anthropicApiKey: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  explanationLevel: "beginner",
  searchLimit: 20,
  anthropicApiKey: "",
};

const STORAGE_KEY = "obcda.settings.v1";

export function loadSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const level = parsed.explanationLevel === "technical" ? "technical" : "beginner";
    const limit = Number(parsed.searchLimit);
    return {
      explanationLevel: level,
      searchLimit:
        Number.isInteger(limit) && limit >= 1 && limit <= 100
          ? limit
          : DEFAULT_SETTINGS.searchLimit,
      anthropicApiKey:
        typeof parsed.anthropicApiKey === "string" ? parsed.anthropicApiKey : "",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
