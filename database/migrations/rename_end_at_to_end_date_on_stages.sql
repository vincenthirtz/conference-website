-- Migration: Renommer end_at en end_date sur tournament_stages
-- Date: 2026-03-09
-- Description:
--   Uniformise le nom de la colonne de fin de phase : end_at → end_date
--   pour être cohérent avec la table tournaments.

ALTER TABLE tournament_stages
RENAME COLUMN end_at TO end_date;
