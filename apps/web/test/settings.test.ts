import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../src/lib/settings";

const STORAGE_KEY = "obcda.settings.v1";

describe("lib/settings — 端末設定の読み書きとサニタイズ（Q4）", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns defaults when nothing is stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips saved settings", () => {
    saveSettings({
      ...DEFAULT_SETTINGS,
      explanationLevel: "technical",
      searchLimit: 50,
    });
    expect(loadSettings()).toMatchObject({
      explanationLevel: "technical",
      searchLimit: 50,
    });
  });

  it("clamps out-of-range search limits back to the default", () => {
    saveSettings({ ...DEFAULT_SETTINGS, searchLimit: 0 });
    expect(loadSettings().searchLimit).toBe(DEFAULT_SETTINGS.searchLimit);
    saveSettings({ ...DEFAULT_SETTINGS, searchLimit: 101 });
    expect(loadSettings().searchLimit).toBe(DEFAULT_SETTINGS.searchLimit);
    saveSettings({ ...DEFAULT_SETTINGS, searchLimit: 3.5 });
    expect(loadSettings().searchLimit).toBe(DEFAULT_SETTINGS.searchLimit);
  });

  it("falls back to defaults for corrupt JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("treats unknown explanation levels as beginner", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, explanationLevel: "expert" }),
    );
    expect(loadSettings().explanationLevel).toBe("beginner");
  });
});
