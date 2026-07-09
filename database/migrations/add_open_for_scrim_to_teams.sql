-- Migration: teams.open_for_scrim (équipe « cherche des scrims », opt-in public)
-- Date: 2026-07-09
--
-- WHY:
--   Permet à un·e capitaine de déclarer publiquement que son équipe est ouverte
--   aux scrims (oui/non). Les équipes « oui » sont mises en avant sur la page
--   publique /scrim (section « Équipes ouvertes aux scrims »), où visiteurs et
--   autres capitaines peuvent alors proposer un scrim. Miroir de `is_joinable`.
--
-- CAVEATS:
--   - Idempotente (ADD COLUMN IF NOT EXISTS). Default false. Pas de nouvelle FK.
--   - Lu par la page publique (getStaticProps via supabaseAdmin) + l'espace
--     capitaine ; écrit via /api/teams/toggle-scrim-open (capitaine only).

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS open_for_scrim boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.teams.open_for_scrim IS
  'true = l''équipe se déclare ouverte aux scrims (affichée publiquement sur /scrim). Togglé par le capitaine.';

NOTIFY pgrst, 'reload schema';
