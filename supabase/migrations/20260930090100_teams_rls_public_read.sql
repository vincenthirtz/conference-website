-- supabase/migrations/20260930090100_teams_rls_public_read.sql
--
-- ⚠️  NON APPLIQUÉE EN PRODUCTION. Rejouée par `supabase start` en CI (e2e,
--     tests/e2e/rls-baseline.spec.ts), donc testée ; à relire puis à appliquer
--     À LA MAIN sur le projet `owwomenscup`. Idempotente.
--
-- POURQUOI.
--   1. `teams_select_public USING (true)` exposait à n'importe quel client
--      anon les équipes supprimées (soft-delete) et désactivées.
--   2. `teams_insert_authenticated` laissait tout compte connecté créer une
--      équipe en écrivant directement dans la table, hors des routes serveur
--      (validation, quotas, blacklist, journal, événements bot).
--
-- DÉCISION.
--   - Lecture publique : `deleted_at IS NULL` et équipe active. `is_active`
--     est nullable (DEFAULT true) : NULL est traité comme actif, comme le
--     défaut de la colonne, pour ne masquer aucune équipe légitime.
--   - La capitaine garde la lecture de SA fiche même inactive : la policy
--     UPDATE `teams_update_captain` a besoin que la ligne soit visible.
--   - Plus aucune insertion directe par anon/authenticated : toutes les
--     créations passent par des routes serveur en service role (qui
--     contourne RLS). Vérifié : aucun code navigateur ne lit ni n'écrit
--     `teams` via un client anon/authentifié ; les vues `*_stats_view` sont
--     lues en service role ; aucune fonction SECURITY INVOKER exposée ne lit
--     `teams` (seul le trigger `teams_set_slug`).

DROP POLICY IF EXISTS teams_select_public ON public.teams;
CREATE POLICY teams_select_public ON public.teams
  AS PERMISSIVE FOR SELECT TO public
  USING (deleted_at IS NULL AND COALESCE(is_active, true));

DROP POLICY IF EXISTS teams_select_captain ON public.teams;
CREATE POLICY teams_select_captain ON public.teams
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (captain_id = (SELECT auth.uid() AS uid));

DROP POLICY IF EXISTS teams_insert_authenticated ON public.teams;
