-- Migration: Ajouter champs descriptifs publics au tournoi
-- Date: 2026-04-16

ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS description_info TEXT DEFAULT NULL;

ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS schedule_details TEXT DEFAULT NULL;

ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS schedule_rules TEXT DEFAULT NULL;

ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS format_details TEXT DEFAULT NULL;

COMMENT ON COLUMN tournaments.description_info IS 'Description generale du tournoi (texte libre)';
COMMENT ON COLUMN tournaments.schedule_details IS 'Calendrier precis avec dates cles';
COMMENT ON COLUMN tournaments.schedule_rules IS 'Regles horaires (check-in, heures de match)';
COMMENT ON COLUMN tournaments.format_details IS 'Description detaillee du format (bracket, bo3/bo5, etc.)';
