-- database/migrations/add_bot_player_actions_table.sql
-- Audit trail des actions joueuses cote bot.
--
-- Distinct de staff_logs qui capture les actions des admins/managers via
-- l'UI ou le bot. Ici on persiste UNIQUEMENT les actions player-driven
-- declenchees depuis Discord (invite create/accept/reject, kick par
-- capitaine, leave, transfer-captain, checkin, report-score, profile
-- update, etc.).
--
-- Use case : support qui veut retracer ce qu'une joueuse a fait sur les
-- 14 derniers jours quand elle se plaint qu'"elle a accepte une invitation
-- mais elle n'est pas dans l'equipe", "elle a fait checkin mais le bot dit
-- non", etc.
--
-- Le helper utils/botPlayerLogs.ts insere ici. Le read se fait via le bot
-- /api/bot/v1/player-actions (staff-only).

CREATE TABLE IF NOT EXISTS bot_player_actions (
  id BIGSERIAL PRIMARY KEY,
  actor_auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_discord_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  target_auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_discord_user_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "Show me what this player did recently"
CREATE INDEX IF NOT EXISTS idx_bot_player_actions_actor_created
  ON bot_player_actions (actor_auth_user_id, created_at DESC);

-- "Show me what was done TO this player" (kicks, transfers, invites)
CREATE INDEX IF NOT EXISTS idx_bot_player_actions_target_created
  ON bot_player_actions (target_auth_user_id, created_at DESC)
  WHERE target_auth_user_id IS NOT NULL;

-- Analytics par type d'action
CREATE INDEX IF NOT EXISTS idx_bot_player_actions_action_created
  ON bot_player_actions (action, created_at DESC);

ALTER TABLE bot_player_actions ENABLE ROW LEVEL SECURITY;
-- Aucune policy : service role uniquement (les utilisateurs ne lisent
-- pas leur propre audit log, c'est cote support).
