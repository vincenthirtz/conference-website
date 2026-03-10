-- Migration: Ajouter tiebreaker_policy aux stages
-- Date: 2026-03-10
-- Description:
--   Ajoute une colonne tiebreaker_policy pour définir le comportement
--   en cas de match à score égal dans un bracket.
--   Valeurs possibles : 'manual', 'extra_round', 'map_diff', 'seed'

ALTER TABLE tournament_stages
ADD COLUMN IF NOT EXISTS tiebreaker_policy TEXT DEFAULT 'manual';

-- Contrainte de valeurs autorisées
ALTER TABLE tournament_stages
ADD CONSTRAINT check_tiebreaker_policy
CHECK (tiebreaker_policy IN ('manual', 'extra_round', 'map_diff', 'seed'));

COMMENT ON COLUMN tournament_stages.tiebreaker_policy IS
  'Politique de départage en cas d''égalité : manual (défaut), extra_round, map_diff, seed.';
