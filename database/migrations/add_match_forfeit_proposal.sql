-- Migration: matches.forfeit_proposal_* (forfait proposé, plus jamais automatique)
-- Date: 2026-10-07
--
-- WHY:
--   Le cron de check-in (utils/checkin.ts, étape « forfait ») appliquait le
--   forfait TOUT SEUL quand une seule équipe avait pointé au coup d'envoi :
--   score requiredWins-0, statut `walkover`, bracket propagé. Une équipe en
--   retard de deux minutes, un check-in oublié par une capitaine présente sur
--   le serveur vocal : le résultat partait quand même, et le défaire voulait
--   dire réécrire un score et dépropager un bracket.
--
--   Règle demandée : plus de forfait automatique. Le cron PROPOSE le forfait ;
--   les admins/owners du tenant le confirment ou le refusent (DM Discord ou
--   fiche admin du match). Une saisie de score par le staff sur le match
--   écrase la proposition.
--
-- WHAT:
--   Colonnes sur `matches` (une proposition au plus par match — le cron ne la
--   pose qu'une fois, gardé par `forfeit_processed_at`) :
--     - forfeit_proposed_team_id      : équipe ABSENTE (celle qui serait forfait)
--     - forfeit_proposed_at           : date de la proposition
--     - forfeit_proposal_status       : pending | confirmed | declined | overridden
--     - forfeit_proposal_resolved_by  : staff qui a tranché (NULL si écrasée
--                                       sans auteur identifiable)
--     - forfeit_proposal_resolved_at  : date de la décision
--   + index partiel sur les propositions en attente.
--
-- COMPORTEMENT APPLICATIF (utils/matches/forfeitProposal.ts) :
--   - création : UPDATE conditionnel `forfeit_proposal_status IS NULL` →
--     idempotent, un second passage du cron ne recrée rien ;
--   - confirmation / refus : UPDATE conditionnel `status = 'pending'` ;
--   - écrasement : applyMatchScore avec un staffId (saisie staff) passe une
--     proposition `pending` à `overridden`.
--
-- CAVEATS:
--   - Tant que cette migration n'est pas appliquée, le cron ne crée AUCUNE
--     proposition et n'applique AUCUN forfait (log warn) : le staff tranche à
--     la main (forfait manuel admin ou /forfait), comme pour tout autre match.
--   - Purement additive. NOTIFY final pour que PostgREST voie les colonnes
--     sans attendre le rechargement périodique de son cache de schéma.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS forfeit_proposed_team_id UUID DEFAULT NULL
    REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forfeit_proposed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS forfeit_proposal_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS forfeit_proposal_resolved_by UUID DEFAULT NULL
    REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forfeit_proposal_resolved_at TIMESTAMPTZ DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.matches'::regclass
      AND conname = 'matches_forfeit_proposal_status_check'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_forfeit_proposal_status_check
      CHECK (
        forfeit_proposal_status IS NULL
        OR forfeit_proposal_status IN ('pending', 'confirmed', 'declined', 'overridden')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_matches_forfeit_proposal_pending
  ON public.matches (tenant_id, forfeit_proposed_at)
  WHERE forfeit_proposal_status = 'pending';

COMMENT ON COLUMN public.matches.forfeit_proposed_team_id IS
  'Équipe absente au coup d''envoi pour laquelle le cron de check-in PROPOSE un forfait (jamais appliqué sans décision staff).';
COMMENT ON COLUMN public.matches.forfeit_proposed_at IS
  'Date de la proposition de forfait (cron check-in).';
COMMENT ON COLUMN public.matches.forfeit_proposal_status IS
  'pending | confirmed (forfait appliqué) | declined (refusé, match inchangé) | overridden (score saisi par le staff).';
COMMENT ON COLUMN public.matches.forfeit_proposal_resolved_by IS
  'Staff ayant confirmé, refusé ou écrasé la proposition.';
COMMENT ON COLUMN public.matches.forfeit_proposal_resolved_at IS
  'Date de la décision sur la proposition de forfait.';

NOTIFY pgrst, 'reload schema';
