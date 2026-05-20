-- Migration: snoozes posés par les joueurs sur leurs actions (mes-actions)
-- Date: 2026-05-20
--
-- Stocke les "snooze" qu'un joueur applique sur une action de sa liste
-- "mes-actions" (GET /api/bot/v1/players/by-discord/:id/actions-todo).
-- L'action_key est stable et derivee des IDs DB (forme `<type>:<entity>:<id>`),
-- garantissant que reposer le snooze sur la meme action ecrase la row au lieu
-- d'en creer une nouvelle.
--
-- Bot-only : pas de policy RLS publique (service_role bypass), comme
-- bot_idempotency / bot_player_actions / bot_locks.

CREATE TABLE IF NOT EXISTS player_action_snoozes (
  discord_user_id TEXT NOT NULL,
  action_key TEXT NOT NULL,
  snoozed_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (discord_user_id, action_key)
);

COMMENT ON TABLE player_action_snoozes IS
  'Bot-only: snoozes posés par les joueurs sur leurs actions (mes-actions).';

-- L'API filtre les actions encore snoozees via WHERE snoozed_until > now().
-- Index sur snoozed_until pour les requetes "what is still snoozed" et pour
-- le cron de purge optionnel.
CREATE INDEX IF NOT EXISTS idx_player_action_snoozes_until
  ON player_action_snoozes (snoozed_until);

-- RLS : bot-only, aucune policy = aucun acces anon/auth. Le service_role
-- bypass RLS donc les routes /api/bot/v1/* (via supabaseAdmin) y accedent.
ALTER TABLE player_action_snoozes ENABLE ROW LEVEL SECURITY;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION player_action_snoozes_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_player_action_snoozes_updated_at ON player_action_snoozes;
CREATE TRIGGER trg_player_action_snoozes_updated_at
  BEFORE UPDATE ON player_action_snoozes
  FOR EACH ROW
  EXECUTE FUNCTION player_action_snoozes_set_updated_at();
