-- Migration: résultats de scrim + reports concordants (prérequis du ladder R8)
-- Date: 2026-07-31
--
-- WHY:
--   La table `scrims` portait la RENCONTRE (équipes, date, stream, salon
--   Discord) mais aucun RÉSULTAT. Conséquence directe : impossible de bâtir un
--   classement permanent de scrims (R8 du backlog réseau) — il ne manquait pas
--   « le classement », il manquait le résultat.
--
--   On décalque le modèle déjà éprouvé des matchs de tournoi
--   (`match_score_reports`, cf. pages/api/player/matches/[matchId]/report-score.ts) :
--     * un seul report          -> on attend l'adversaire, rien ne bouge ;
--     * les deux concordent     -> le scrim est clos automatiquement ;
--     * les deux divergent      -> `status='disputed'`, arbitrage humain.
--   Aucun staff n'est requis dans le cas nominal : ce sont les deux équipes qui
--   valident, comme pour les matchs.
--
-- CHOIX :
--   - `ranked` (défaut true) : un scrim d'entraînement peut être exclu du
--     classement. Le drapeau vit sur la RENCONTRE et non sur l'équipe — c'est
--     au cas par cas que la question se pose.
--   - `winner_team_id` NULL avec des scores égaux = match nul (1 point chacun).
--     NULL avec des scores NULL = simplement pas encore joué/rapporté.
--   - status : on ajoute 'disputed' au CHECK existant (draft, scheduled,
--     running, completed, cancelled). Le terminal reste 'completed'.
--
-- RLS — `scrim_score_reports` : default deny STRICT (aucune policy), aligné sur
--   scrim_plannings / scrim_searches. Tout passe par les routes API, qui
--   exigent la permission d'équipe `manage_scrims`.
--
-- CAVEATS:
--   - Idempotente (IF NOT EXISTS, DROP CONSTRAINT avant ADD).
--   - Nouvelle table + FK ⇒ reload du schema-cache PostgREST (NOTIFY final).

BEGIN;

-- ===========================================================================
-- 1) Résultat porté par la rencontre
-- ===========================================================================

ALTER TABLE public.scrims
  ADD COLUMN IF NOT EXISTS winner_team_id uuid
    REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team1_score integer,
  ADD COLUMN IF NOT EXISTS team2_score integer,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ranked boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dispute_reason text;

COMMENT ON COLUMN public.scrims.winner_team_id IS
  'Vainqueur du scrim. NULL + scores égaux = match nul ; NULL + scores NULL = pas encore rapporté.';
COMMENT ON COLUMN public.scrims.ranked IS
  'Le scrim compte pour le classement permanent. false = entraînement hors classement.';
COMMENT ON COLUMN public.scrims.dispute_reason IS
  'Renseigné quand les deux reports divergent (status=disputed).';

-- Statut : ajout de 'disputed' (reports divergents, arbitrage humain).
ALTER TABLE public.scrims DROP CONSTRAINT IF EXISTS scrims_status_check;
ALTER TABLE public.scrims ADD CONSTRAINT scrims_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text, 'scheduled'::text, 'running'::text,
    'completed'::text, 'cancelled'::text, 'disputed'::text
  ]));

-- Classement : on ne lit que les scrims classés et terminés.
CREATE INDEX IF NOT EXISTS scrims_ladder_idx
  ON public.scrims (tenant_id, completed_at DESC)
  WHERE status = 'completed' AND ranked AND deleted_at IS NULL;

-- ===========================================================================
-- 2) Reports de score — un par camp, décalque de match_score_reports
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.scrim_score_reports (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  scrim_id                  uuid NOT NULL
    REFERENCES public.scrims(id) ON DELETE CASCADE,
  -- 1 = team1 du scrim, 2 = team2 (même convention que match_score_reports).
  team_side                 smallint NOT NULL,
  reported_by_auth_user_id  uuid NOT NULL,
  team1_score               integer NOT NULL,
  team2_score               integer NOT NULL,
  reported_at               timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scrim_score_reports_side_check CHECK (team_side IN (1, 2)),
  CONSTRAINT scrim_score_reports_scores_check
    CHECK (team1_score >= 0 AND team2_score >= 0),
  -- Un seul report par camp : re-rapporter CORRIGE (upsert), ne s'empile pas.
  CONSTRAINT scrim_score_reports_unique_side UNIQUE (scrim_id, team_side)
);

COMMENT ON TABLE public.scrim_score_reports IS
  'Report de score d''un scrim par un camp. Deux reports concordants clôturent le scrim ; divergents => status=disputed.';

CREATE INDEX IF NOT EXISTS scrim_score_reports_scrim_idx
  ON public.scrim_score_reports (scrim_id);

CREATE OR REPLACE FUNCTION public.scrim_score_reports_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scrim_score_reports_updated_at
  ON public.scrim_score_reports;
CREATE TRIGGER trg_scrim_score_reports_updated_at
  BEFORE UPDATE ON public.scrim_score_reports
  FOR EACH ROW EXECUTE FUNCTION public.scrim_score_reports_set_updated_at();

ALTER TABLE public.scrim_score_reports ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';
