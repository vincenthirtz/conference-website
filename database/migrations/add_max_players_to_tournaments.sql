-- Migration: Ajouter max_players aux tournois
-- Date: 2026-03-22
-- Description:
--   Ajoute une colonne max_players pour définir le nombre maximum de joueuses
--   autorisé par équipe dans un tournoi. NULL = pas de limite.

-- Ajouter la colonne max_players (nullable, défaut NULL = pas de maximum)
ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT NULL;

-- Ajouter une contrainte pour s'assurer que max_players est positif si défini
ALTER TABLE tournaments
ADD CONSTRAINT check_max_players_positive
CHECK (max_players IS NULL OR max_players > 0);

-- S'assurer que max >= min si les deux sont définis
ALTER TABLE tournaments
ADD CONSTRAINT check_max_gte_min_players
CHECK (max_players IS NULL OR min_players IS NULL OR max_players >= min_players);

-- Commentaire pour documentation
COMMENT ON COLUMN tournaments.max_players IS
  'Nombre maximum de joueuses autorisé par équipe dans le tournoi. NULL = pas de limite.';
