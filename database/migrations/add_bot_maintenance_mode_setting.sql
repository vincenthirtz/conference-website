-- database/migrations/add_bot_maintenance_mode_setting.sql
-- Adds the bot_maintenance_mode flag to site_settings.
-- When set to 'true', all non-GET routes under /api/bot/v1/* return 503
-- with code='MAINTENANCE_MODE'. Reads keep working so the bot can still
-- poll reminders / snapshot / lists during a deploy or DB migration.

INSERT INTO site_settings (key, value)
VALUES ('bot_maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;
