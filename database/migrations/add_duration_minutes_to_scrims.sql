-- Migration: scrims.duration_minutes (durée d'un scrim, pour l'agenda admin)
-- Date: 2026-07-09
--
-- WHY:
--   L'agenda admin (vue semaine/mois) rend chaque scrim comme un bloc dont la
--   hauteur = durée. Jusqu'ici la durée était fixée à 120 min par défaut côté
--   UI ; cette colonne la rend éditable (redimensionnement du bloc → PATCH).
--
-- CAVEATS:
--   - Idempotente (ADD COLUMN IF NOT EXISTS). Default 120 min. NULL toléré →
--     l'UI retombe sur 120. Pas de nouvelle FK.

ALTER TABLE public.scrims
  ADD COLUMN IF NOT EXISTS duration_minutes integer DEFAULT 120
    CHECK (duration_minutes IS NULL OR (duration_minutes >= 15 AND duration_minutes <= 720));

COMMENT ON COLUMN public.scrims.duration_minutes IS
  'Durée du scrim en minutes (pour l''affichage agenda). NULL → 120 par défaut côté UI.';

NOTIFY pgrst, 'reload schema';
