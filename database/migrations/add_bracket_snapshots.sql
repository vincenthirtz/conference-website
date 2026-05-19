-- Migration: bracket_snapshots
--
-- Capture l'état complet des matches d'un stage AVANT chaque mutation
-- impactante (apply score, auto-seed, advance teams). Permet à un admin
-- de "rollback" plus large que le rollback in-memory déjà présent dans
-- applyMatchScore (qui ne couvre que le slot adjacent et le state du match
-- courant).
--
-- Le snapshot est un JSONB : on dump l'array { id, team1_id, team2_id,
-- team1_score, team2_score, winner_team_id, status, completed_at,
-- forfeit_team_id } des matches du stage. Pour restore : on UPDATE chaque
-- match avec son état snapshot.
--
-- Rétention : par défaut on ne purge pas (volume faible — un snapshot fait
-- quelques KB pour un stage de 30 matches). Une purge périodique des
-- snapshots > 30j peut être ajoutée si besoin.

CREATE TABLE IF NOT EXISTS bracket_snapshots (
  id BIGSERIAL PRIMARY KEY,
  stage_id UUID NOT NULL REFERENCES tournament_stages(id) ON DELETE CASCADE,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  taken_by_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  reason TEXT,                   -- 'apply_score' | 'auto_seed' | 'manual' | ...
  matches_snapshot JSONB NOT NULL,
  match_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_bracket_snapshots_stage
  ON bracket_snapshots (stage_id, taken_at DESC);

ALTER TABLE bracket_snapshots ENABLE ROW LEVEL SECURITY;
-- Pas de policy : service_role only.

COMMENT ON COLUMN bracket_snapshots.reason IS
  'Identifiant de l''action déclenchante. Permet de filtrer les rollbacks (ex: ne garder que les snapshots "manual" pour purge).';
