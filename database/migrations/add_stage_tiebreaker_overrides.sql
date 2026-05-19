-- Migration: stage_tiebreaker_overrides
--
-- Permet à un admin d'imposer manuellement qu'une équipe passe devant une
-- autre dans le classement final d'un stage. Cas d'usage :
--   - finale de tie-break jouée hors-tournoi (refusable côté code)
--   - décision admin pour fairness (panneau d'arbitrage)
--   - correction d'un bug de scoring qu'on ne peut pas re-jouer
--
-- Une row = "winner_team_id passe devant loser_team_id si égalité de score
-- dans le classement de ce stage". Appliqué en post-tri par
-- computeStageStandings : si les deux teams ont le même score et sont
-- adjacentes dans le tri, on swap. Sinon ignoré (avec warning log).

CREATE TABLE IF NOT EXISTS stage_tiebreaker_overrides (
  id BIGSERIAL PRIMARY KEY,
  stage_id UUID NOT NULL REFERENCES tournament_stages(id) ON DELETE CASCADE,
  winner_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  loser_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  reason TEXT,
  set_by_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_self_override CHECK (winner_team_id <> loser_team_id),
  CONSTRAINT unique_override UNIQUE (stage_id, winner_team_id, loser_team_id)
);

CREATE INDEX IF NOT EXISTS idx_stage_tiebreaker_overrides_stage
  ON stage_tiebreaker_overrides (stage_id);

ALTER TABLE stage_tiebreaker_overrides ENABLE ROW LEVEL SECURITY;
-- Pas de policy : service_role only.
