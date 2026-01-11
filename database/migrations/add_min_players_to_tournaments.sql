-- Migration: Ajouter min_players aux tournois
-- Date: 2026-01-11
-- Description:
--   Ajoute une colonne min_players pour définir le nombre minimum de joueuses
--   requis pour qu'une équipe puisse s'inscrire à un tournoi.

-- Ajouter la colonne min_players (nullable, défaut NULL = pas de minimum)
ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS min_players INTEGER DEFAULT NULL;

-- Ajouter une contrainte pour s'assurer que min_players est positif si défini
ALTER TABLE tournaments
ADD CONSTRAINT check_min_players_positive
CHECK (min_players IS NULL OR min_players > 0);

-- Commentaire pour documentation
COMMENT ON COLUMN tournaments.min_players IS
  'Nombre minimum de joueuses requises par équipe pour s''inscrire au tournoi. NULL = pas de minimum.';
