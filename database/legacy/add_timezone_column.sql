-- ARCHIVÉ le 2026-06-26 : versionné dans migrations/add_timezone_to_tournaments.sql
--   (patch additif repris à l'identique).
--   Conservé pour historique — NE PAS exécuter, NE PAS appliquer.
-- =====================================================================

-- Add missing timezone column to tournaments table
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS timezone text DEFAULT NULL;
