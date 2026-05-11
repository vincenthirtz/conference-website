-- Migration: Discord identity & source tracking on support tickets
-- Date: 2026-05-11
--
-- Permet au bot Discord de creer des tickets via /api/support/ticket en
-- portant l'identite Discord du reporter (snapshot username + user id).
-- Si is_anonymous=true, ces champs restent NULL pour preserver l'anonymat.

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS discord_user_id text,
  ADD COLUMN IF NOT EXISTS discord_username text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'web'
    CHECK (source IN ('web', 'discord_bot'));

CREATE INDEX IF NOT EXISTS support_tickets_discord_user_idx
  ON support_tickets (discord_user_id);

COMMENT ON COLUMN support_tickets.discord_user_id IS
  'Discord user ID du reporter (snowflake). NULL si anonyme ou ticket web.';
COMMENT ON COLUMN support_tickets.discord_username IS
  'Username Discord lisible au moment du signalement. NULL si anonyme ou ticket web.';
COMMENT ON COLUMN support_tickets.source IS
  'Provenance du ticket: web (formulaire public) ou discord_bot (slash command).';
