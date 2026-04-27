-- Migration: Discord webhooks per tournament + channel type
-- Date: 2026-04-28
--
-- Permet de configurer un webhook Discord par tournoi ET par type de channel
-- (annonces de matchs, resultats, bracket, annonces generales, veto live).
-- Si tournament_id est NULL, le webhook est utilise comme fallback global pour
-- les tournois qui n'ont pas leur propre configuration.

CREATE TABLE IF NOT EXISTS discord_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES tournaments(id) ON DELETE CASCADE,
  channel_type text NOT NULL CHECK (channel_type IN (
    'match_announcements',
    'match_results',
    'bracket_updates',
    'general_announcements',
    'veto_live'
  )),
  webhook_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  role_mention text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Une seule conf par (tournament, channel_type). NULL est traite comme une
-- valeur distincte par les contraintes UNIQUE de Postgres, donc on cree deux
-- index : un pour les confs par tournoi, un pour le fallback global.
CREATE UNIQUE INDEX IF NOT EXISTS discord_webhooks_tournament_channel_uidx
  ON discord_webhooks (tournament_id, channel_type)
  WHERE tournament_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS discord_webhooks_global_channel_uidx
  ON discord_webhooks (channel_type)
  WHERE tournament_id IS NULL;

CREATE INDEX IF NOT EXISTS discord_webhooks_lookup_idx
  ON discord_webhooks (tournament_id, channel_type)
  WHERE is_active = true;

COMMENT ON TABLE discord_webhooks IS 'Webhooks Discord configurables par tournoi et par type de channel.';
COMMENT ON COLUMN discord_webhooks.tournament_id IS 'NULL = fallback global pour les tournois sans conf dediee.';
COMMENT ON COLUMN discord_webhooks.channel_type IS 'Type de notification: match_announcements, match_results, bracket_updates, general_announcements, veto_live.';
COMMENT ON COLUMN discord_webhooks.role_mention IS 'Optionnel: ID de role Discord a ping (sans <@&...>), ex: "1234567890" ou "everyone" / "here".';
