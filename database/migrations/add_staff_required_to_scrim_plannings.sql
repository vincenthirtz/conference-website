-- Migration: scrim_plannings.staff_required (staff optionnel par session)
-- Date: 2026-07-09
--
-- WHY:
--   Tous les scrims n'ont pas besoin d'un caster/arbitre. Par défaut le staff est
--   OPTIONNEL (un créneau est planifiable dès que les 2 équipes sont dispo) ; ce
--   flag permet, pour une session donnée, d'EXIGER le staff (un créneau n'est
--   « planifiable » que si les 2 équipes ET le staff sont présents).
--
-- CAVEATS:
--   - Idempotente (ADD COLUMN IF NOT EXISTS). Default false = comportement actuel
--     inchangé. Pas de nouvelle FK → reload schema-cache non requis (NOTIFY inoffensif).

ALTER TABLE public.scrim_plannings
  ADD COLUMN IF NOT EXISTS staff_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.scrim_plannings.staff_required IS
  'true = le staff doit être présent pour qu''un créneau soit planifiable (sinon staff optionnel, défaut).';

NOTIFY pgrst, 'reload schema';
