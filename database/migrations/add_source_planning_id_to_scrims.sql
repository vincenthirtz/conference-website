-- Migration: scrims.source_planning_id (back-ref vers scrim_plannings)
-- Date: 2026-07-09
--
-- WHY:
--   La validation d'une session de planning (scrim_plannings) crée un `scrims`
--   scheduled. On garde une traçabilité + une clé d'idempotence : un seul scrim
--   par planning validé. Cette colonne est la FK inverse de scrim_plannings.scrim_id.
--
--   FK circulaire ⇒ 2 migrations : add_scrim_plannings.sql crée d'abord
--   scrim_plannings (dont scrim_id -> scrims existe déjà), puis CETTE migration
--   ajoute scrims.source_planning_id -> scrim_plannings (désormais existante).
--
-- CAVEATS:
--   - Idempotente (ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).
--   - Dépendance : APRÈS add_scrim_plannings.sql.
--   - Nouvelle FK ⇒ PostgREST schema cache reload REQUIS (NOTIFY final).

BEGIN;

ALTER TABLE public.scrims
  ADD COLUMN IF NOT EXISTS source_planning_id uuid
    REFERENCES public.scrim_plannings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.scrims.source_planning_id IS
  'Session de planning (scrim_plannings) dont est issu ce scrim, si créé via la grille de dispos. Clé d''idempotence de la validation.';

-- UNIQUE partiel : garantit au plus 1 scrim par planning validé (idempotence
-- de la validation renforcée au niveau DB — évite un doublon sur double-appel
-- concurrent, la route faisant un SELECT-then-INSERT non atomique).
CREATE UNIQUE INDEX IF NOT EXISTS idx_scrims_source_planning_id
  ON public.scrims (source_planning_id)
  WHERE source_planning_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
