-- Migration: colonnes Discord-native UX (threads de match, scheduled events,
--            voice par equipe, forum disputes)
--
-- Le bot Discord gere desormais des objets Discord natifs lies a chaque match
-- ou equipe. On stocke leurs IDs cote site pour permettre :
--   - l'idempotence des handlers (ne pas recreer un thread si deja existant) ;
--   - les writebacks bot -> site via PATCH /api/bot/v1/matches/[id]/discord
--     et /api/bot/v1/teams/[id]/discord ;
--   - le cleanup (delete) lors de team.dissolved.
--
-- Tous les champs sont nullables : un match qui n'a pas encore demarre n'a pas
-- de thread, un scrim peut ne jamais avoir de scheduled event, etc.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS discord_thread_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS discord_scheduled_event_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS discord_dispute_thread_id text DEFAULT NULL;

COMMENT ON COLUMN matches.discord_thread_id IS
  'ID du thread Discord cree dans #matchs-live sur match.starting (embed score live).';
COMMENT ON COLUMN matches.discord_scheduled_event_id IS
  'ID du Discord Guild Scheduled Event natif cree quand scheduled_at est defini.';
COMMENT ON COLUMN matches.discord_dispute_thread_id IS
  'ID du thread forum cree dans le canal disputes sur match.disputed.';

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS discord_voice_channel_id text DEFAULT NULL;

COMMENT ON COLUMN teams.discord_voice_channel_id IS
  'ID du salon vocal Discord cree par le bot sur team.created (supprime sur team.dissolved).';
