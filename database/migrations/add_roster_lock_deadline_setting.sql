-- database/migrations/add_roster_lock_deadline_setting.sql
-- Adds the roster_lock_deadline setting to site_settings.
--
-- ISO timestamp (UTC) at which team rosters are locked for the current
-- tournament. Read by utils/teamMessages.ts:
--   1. displayed in the reminder posted in each team's Discord text channel
--      ("Deadline : lundi 31 août à 23:00"), and
--   2. used as the reference date for the J-21/14/7/3/1 milestones of the
--      /api/cron/team-roster-reminders scheduled job.
--
-- When absent or unparseable, the code falls back to tournaments.start_date —
-- the deadline line is simply omitted from the message rather than guessed.
--
-- Value below = 2026-08-31 23:00 Europe/Paris (CEST, UTC+2) for the
-- OW WOMEN'S CUP 2026. Update it per edition.

INSERT INTO site_settings (key, value, description)
VALUES (
  'roster_lock_deadline',
  '2026-08-31T21:00:00+00:00',
  'Deadline ISO de verrouillage des rosters (UTC). Lue par utils/teamMessages.ts : affichee dans les rappels d''equipe et sert de reference aux jalons J-21/14/7/3/1 du cron /api/cron/team-roster-reminders. Si vide, fallback sur tournaments.start_date.'
)
ON CONFLICT (key) DO NOTHING;
