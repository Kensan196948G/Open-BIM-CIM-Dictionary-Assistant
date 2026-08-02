-- 0002_ai_settings.down.sql — rollback of 0002_ai_settings.sql.
-- Destructive: removes admin-managed runtime settings (incl. stored API key).

BEGIN;

DROP TABLE IF EXISTS app_settings;

COMMIT;
