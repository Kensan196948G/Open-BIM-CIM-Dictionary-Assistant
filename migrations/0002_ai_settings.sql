-- 0002_ai_settings.sql — admin-managed runtime settings (詳細設計仕様書 §6.4 AI設定)
-- Stores the Anthropic API key entered from the admin 設定 UI. The env
-- secrets (LLM_API_KEY / ANTHROPIC_API_KEY) take precedence when set.
-- Target: Neon PostgreSQL 17 compatible.
-- Note: keep packages/db/src/schema.ts in sync with this file.

BEGIN;

CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
