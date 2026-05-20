-- Migration: wrap auth.uid() calls in (SELECT auth.uid()) inside RLS policies
--
-- WHY:
--   Postgres re-evaluates `auth.uid()` for every row when it appears bare in
--   a USING / WITH CHECK clause. Wrapping it in `(SELECT auth.uid())` lets
--   the planner treat it as an InitPlan: evaluated once per query, then reused.
--   Documented in: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
--   The performance advisor's rule 0003 (auth_rls_initplan) flagged 8 policies.
--   `stage_teams_service_role_all` was the 8th — already dropped by the
--   consolidate_permissive_policies.sql migration, so 7 remain here.
--
-- WHAT:
--   For each affected policy: DROP + recreate with the SELECT-wrapped expression.
--   No semantic change; same role, same operation, same predicate.

BEGIN;

-- teams.teams_insert_authenticated -----------------------------------------
DROP POLICY IF EXISTS teams_insert_authenticated ON public.teams;
CREATE POLICY teams_insert_authenticated
  ON public.teams
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- teams.teams_update_captain -----------------------------------------------
DROP POLICY IF EXISTS teams_update_captain ON public.teams;
CREATE POLICY teams_update_captain
  ON public.teams
  FOR UPDATE
  USING (captain_id = (SELECT auth.uid()))
  WITH CHECK (captain_id = (SELECT auth.uid()));

-- teams.teams_delete_captain -----------------------------------------------
DROP POLICY IF EXISTS teams_delete_captain ON public.teams;
CREATE POLICY teams_delete_captain
  ON public.teams
  FOR DELETE
  USING (captain_id = (SELECT auth.uid()));

-- requests.requests_select_own ---------------------------------------------
DROP POLICY IF EXISTS requests_select_own ON public.requests;
CREATE POLICY requests_select_own
  ON public.requests
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- requests.requests_insert_own ---------------------------------------------
DROP POLICY IF EXISTS requests_insert_own ON public.requests;
CREATE POLICY requests_insert_own
  ON public.requests
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

-- demandes."Users can view own demandes" -----------------------------------
DROP POLICY IF EXISTS "Users can view own demandes" ON public.demandes;
CREATE POLICY "Users can view own demandes"
  ON public.demandes
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- demandes."Users can create demandes" -------------------------------------
DROP POLICY IF EXISTS "Users can create demandes" ON public.demandes;
CREATE POLICY "Users can create demandes"
  ON public.demandes
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

COMMIT;
