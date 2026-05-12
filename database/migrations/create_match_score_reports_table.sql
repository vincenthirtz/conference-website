-- Migration: report de score par capitaine via Discord bot
-- Date: 2026-05-12
--
-- Stocke un report par equipe (au plus un par match_side). Le bot Discord
-- expose une commande aux capitaines pour soumettre un score ; le serveur
-- compare les deux reports :
--   - un seul present       -> on attend l'adversaire (matches.status inchange)
--   - les deux concordent   -> applyMatchScore() finalise le match
--   - les deux divergent    -> matches.status -> 'disputed' + webhook admin
--
-- Le report est upsert sur (match_id, team_side) pour qu'un capitaine puisse
-- corriger son entree sans creer de doublon.

BEGIN;

CREATE TABLE IF NOT EXISTS match_score_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  match_id   uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_side  smallint NOT NULL,

  -- Le capitaine qui soumet (auth.users.id). On garde aussi le discord_user_id
  -- au moment du report pour audit si le lien est supprime apres coup.
  reported_by_auth_user_id uuid NOT NULL,
  discord_user_id          text,

  team1_score integer NOT NULL,
  team2_score integer NOT NULL,

  reported_at timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT match_score_reports_side_chk    CHECK (team_side IN (1, 2)),
  CONSTRAINT match_score_reports_t1_nonneg   CHECK (team1_score >= 0),
  CONSTRAINT match_score_reports_t2_nonneg   CHECK (team2_score >= 0),
  CONSTRAINT match_score_reports_unique_side UNIQUE (match_id, team_side)
);

COMMENT ON TABLE match_score_reports IS 'Un report de score par capitaine et par match (max 2). Source des disputes auto + de la finalisation auto sur accord.';

CREATE INDEX IF NOT EXISTS idx_match_score_reports_match_id
  ON match_score_reports (match_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION match_score_reports_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_match_score_reports_updated_at ON match_score_reports;
CREATE TRIGGER trg_match_score_reports_updated_at
  BEFORE UPDATE ON match_score_reports
  FOR EACH ROW
  EXECUTE FUNCTION match_score_reports_set_updated_at();

COMMIT;
