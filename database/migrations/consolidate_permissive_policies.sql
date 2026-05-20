-- Migration: remove overlapping RLS policies on teams and stage_teams
--
-- WHY:
--   The performance advisor's rule 0006 (multiple_permissive_policies) flagged
--   two tables where two permissive SELECT policies overlap, forcing the
--   planner to execute both for every row:
--     - teams: `teams_anon_read_active` (USING is_active AND deleted_at IS NULL)
--              + `teams_select_public` (USING true) — the second is strictly
--              broader, so the first is dead weight.
--     - stage_teams: `stage_teams_select_all` (SELECT USING true)
--              + `stage_teams_service_role_all` (ALL USING auth.role()=service_role)
--              — service_role bypasses RLS regardless of policy, so the second
--              policy adds nothing but planner overhead.
--
-- WHAT:
--   Drop the redundant policy in each pair. Keep the public-read SELECT one.
--
-- CAVEATS:
--   service_role still bypasses RLS by default — server-side handlers using
--   `supabaseAdmin` continue to work unchanged on stage_teams writes.

BEGIN;

-- teams: drop the narrower SELECT policy, keep teams_select_public
DROP POLICY IF EXISTS teams_anon_read_active ON public.teams;

-- stage_teams: drop the service_role catch-all, service_role bypasses RLS anyway
DROP POLICY IF EXISTS stage_teams_service_role_all ON public.stage_teams;

COMMIT;
