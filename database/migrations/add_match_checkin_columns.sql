-- Migration: Per-match check-in flow
-- Date: 2026-04-28
--
-- Ajoute les colonnes necessaires au flow check-in / forfait par match :
-- - tokens publics (un par equipe, par match) pour le lien personnel envoye au capitaine
-- - timestamps de check-in (un par equipe)
-- - timestamps "etape franchie" pour ne pas re-emettre les emails / pings / forfaits
--
-- Le flow temporel par match est :
--   T-60min  -> generation des tokens + email aux capitaines
--   T-30min  -> ping Discord (rappel)
--   T-15min  -> ping Discord (rappel)
--   T-0      -> forfait auto pour les equipes non checkees
--
-- Ajoute aussi le channel_type "checkin_reminders" a discord_webhooks pour pouvoir
-- configurer un webhook dedie aux rappels de check-in.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS team1_checkin_token text,
  ADD COLUMN IF NOT EXISTS team1_checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS team2_checkin_token text,
  ADD COLUMN IF NOT EXISTS team2_checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkin_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_30_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_15_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS forfeit_processed_at timestamptz;

-- Lookup d'un token vers son match : index unique partiel pour rejeter les
-- collisions (extremement improbables avec 32+ bytes de random) sans bloquer
-- les NULL.
CREATE UNIQUE INDEX IF NOT EXISTS matches_team1_checkin_token_uidx
  ON matches (team1_checkin_token)
  WHERE team1_checkin_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS matches_team2_checkin_token_uidx
  ON matches (team2_checkin_token)
  WHERE team2_checkin_token IS NOT NULL;

-- Index pour la requete cron : "matches a venir avec scheduled_at dans une
-- fenetre temporelle, status pending"
CREATE INDEX IF NOT EXISTS matches_checkin_window_idx
  ON matches (scheduled_at)
  WHERE status = 'pending' AND scheduled_at IS NOT NULL;

COMMENT ON COLUMN matches.team1_checkin_token IS 'Token URL-safe unique pour le check-in du capitaine de team1.';
COMMENT ON COLUMN matches.team2_checkin_token IS 'Token URL-safe unique pour le check-in du capitaine de team2.';
COMMENT ON COLUMN matches.checkin_email_sent_at IS 'Timestamp du moment ou l''email de check-in (T-60min) a ete envoye.';
COMMENT ON COLUMN matches.reminder_30_sent_at IS 'Timestamp du rappel Discord T-30min.';
COMMENT ON COLUMN matches.reminder_15_sent_at IS 'Timestamp du rappel Discord T-15min.';
COMMENT ON COLUMN matches.forfeit_processed_at IS 'Timestamp du passage en forfait auto (T-0).';

-- Etendre la liste des channel_types autorises sur discord_webhooks
DO $$
BEGIN
  ALTER TABLE discord_webhooks
    DROP CONSTRAINT IF EXISTS discord_webhooks_channel_type_check;

  ALTER TABLE discord_webhooks
    ADD CONSTRAINT discord_webhooks_channel_type_check
    CHECK (channel_type IN (
      'match_announcements',
      'match_results',
      'bracket_updates',
      'general_announcements',
      'veto_live',
      'checkin_reminders'
    ));
END $$;
