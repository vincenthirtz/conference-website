-- Migration: Ajouter colonnes manquantes à tournaments
-- Date: 2026-03-09
-- Description:
--   Ajoute is_featured, logo_url, format_type, banner_url et visibility
--   à la table tournaments pour supporter la page d'édition admin.

ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL;

ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS format_type TEXT DEFAULT NULL;

ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS banner_url TEXT DEFAULT NULL;

ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';

COMMENT ON COLUMN tournaments.is_featured IS 'Tournoi mis en avant sur la page d''accueil';
COMMENT ON COLUMN tournaments.logo_url IS 'URL du logo du tournoi';
COMMENT ON COLUMN tournaments.format_type IS 'Type de format (single_elim, double_elim, swiss, round_robin, showmatch)';
COMMENT ON COLUMN tournaments.banner_url IS 'URL de la banniere du tournoi';
COMMENT ON COLUMN tournaments.visibility IS 'Visibilite du tournoi (public, private)';
