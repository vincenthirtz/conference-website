-- Migration: teams.discord_channel_id — salon TEXTE privé d'équipe
-- Date: 2026-07-23
--
-- Le provisioning Discord natif (services/discord-bot/team-voice.js) crée un
-- salon TEXTE privé par équipe (en plus du vocal) et writeback son id ici via
-- PATCH /api/bot/v1/teams/:id/discord. La colonne était référencée par le code
-- (writeback, reconcile/team-channels, botEventEnrich, teams/leave…) mais
-- n'avait jamais été créée en prod : le writeback texte n'avait encore jamais
-- été exercé, d'où un 500 « column discord_channel_id does not exist » au
-- premier appel. Pendant de discord_voice_channel_id
-- (add_discord_native_ux_columns.sql).

ALTER TABLE teams ADD COLUMN IF NOT EXISTS discord_channel_id text;

COMMENT ON COLUMN teams.discord_channel_id IS
  'Salon Discord TEXTE privé de l''équipe (créé sur team.created, supprimé sur team.dissolved).';

-- Nouvelle colonne exposée via l'API PostgREST → recharger le cache de schéma.
NOTIFY pgrst, 'reload schema';
