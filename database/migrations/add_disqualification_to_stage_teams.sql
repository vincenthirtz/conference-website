-- Migration: stage_teams.disqualif* (disqualifier une équipe d'une phase)
-- Date: 2026-10-08
--
-- WHY:
--   Une équipe qui abandonne en cours de phase (ou qu'on sanctionne) n'avait
--   aucun statut : le staff passait ses matchs restants un par un en forfait
--   ou les annulait à la main, et elle restait classée comme les autres —
--   y compris en position qualificative si ses résultats le permettaient.
--
-- WHAT:
--   Colonnes sur `stage_teams` (une disqualification au plus par inscription) :
--     - disqualified_at          : date de la décision (NULL = pas disqualifiée)
--     - disqualification_mode    : 'forfeit' (matchs restants perdus par
--                                  forfait, ses résultats comptent) ou
--                                  'annul' (tous ses matchs ignorés du
--                                  classement, matchs restants annulés)
--     - disqualification_reason  : motif saisi par le staff (affiché)
--     - disqualified_by          : staff à l'origine de la décision
--   + contrainte de cohérence : date et mode vont ensemble.
--
-- COMPORTEMENT APPLICATIF :
--   - features/admin/stages/service/disqualify.ts pose / retire ces colonnes
--     (route POST / DELETE /api/admin/stages/[stageId]/disqualify).
--   - utils/stages/standings.ts : une équipe disqualifiée est classée APRÈS
--     toutes les autres et n'est jamais qualifiée (avancement manuel / auto).
--
-- CAVEATS:
--   - Tant que la migration n'est pas appliquée, la lecture des
--     disqualifications échoue proprement (journalisée) et les classements
--     se calculent comme avant ; seule la route de disqualification répond
--     en erreur.
--   - Purement additive. FK vers `staff` : NOTIFY final pour que PostgREST
--     voie les colonnes sans attendre le rechargement de son cache.

ALTER TABLE public.stage_teams
  ADD COLUMN IF NOT EXISTS disqualified_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disqualification_mode TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disqualification_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disqualified_by UUID DEFAULT NULL
    REFERENCES public.staff(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.stage_teams'::regclass
      AND conname = 'stage_teams_disqualification_mode_check'
  ) THEN
    ALTER TABLE public.stage_teams
      ADD CONSTRAINT stage_teams_disqualification_mode_check
      CHECK (
        disqualification_mode IS NULL
        OR disqualification_mode IN ('forfeit', 'annul')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.stage_teams'::regclass
      AND conname = 'stage_teams_disqualification_consistency_check'
  ) THEN
    ALTER TABLE public.stage_teams
      ADD CONSTRAINT stage_teams_disqualification_consistency_check
      CHECK ((disqualified_at IS NULL) = (disqualification_mode IS NULL));
  END IF;
END $$;

-- Index partiel : les classements lisent les disqualifiés d'une phase.
CREATE INDEX IF NOT EXISTS idx_stage_teams_disqualified
  ON public.stage_teams (stage_id)
  WHERE disqualified_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stage_teams_disqualified_by
  ON public.stage_teams (disqualified_by)
  WHERE disqualified_by IS NOT NULL;

NOTIFY pgrst, 'reload schema';
