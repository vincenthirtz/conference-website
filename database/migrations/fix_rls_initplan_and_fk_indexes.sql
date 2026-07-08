-- Migration: RLS initplan perf + covering indexes for unindexed FKs
--
-- WHY (from Supabase advisors, performance):
--   1) 7 RLS policies re-evaluate auth.<fn>() PER ROW ("Auth RLS Initialization
--      Plan" WARN). Wrapping the call in a scalar subquery `(select auth.uid())`
--      makes Postgres evaluate it ONCE per query instead of once per row — same
--      semantics, large win on RLS-filtered scans.
--      Docs: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--   2) 10 foreign keys have no covering index ("Unindexed foreign keys" INFO),
--      slowing joins / cascade checks.
--
-- WHAT: ALTER POLICY (logic unchanged, only auth.uid() wrapped) +
--       CREATE INDEX IF NOT EXISTS. Additive / non-destructive. Transaction,
--       no CONCURRENTLY (repo convention). No FK/RLS *shape* change → no
--       PostgREST schema-cache reload needed.

BEGIN;

-- ── 1. RLS init-plan: wrap auth.uid() in a scalar subquery ──────────────────

ALTER POLICY event_cues_caster_select ON public.event_cues
  USING (
    tenant_id IN (
      SELECT cm.tenant_id FROM cast_members cm
      WHERE cm.auth_user_id = (select auth.uid()) AND cm.is_active = true
    )
  );

ALTER POLICY event_cue_acks_caster_select ON public.event_cue_acks
  USING (
    tenant_id IN (
      SELECT cm.tenant_id FROM cast_members cm
      WHERE cm.auth_user_id = (select auth.uid()) AND cm.is_active = true
    )
  );

ALTER POLICY caster_presence_caster_select ON public.caster_presence
  USING (
    tenant_id IN (
      SELECT cm.tenant_id FROM cast_members cm
      WHERE cm.auth_user_id = (select auth.uid()) AND cm.is_active = true
    )
  );

ALTER POLICY caster_scenes_insert ON public.caster_scenes
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_user_id = (select auth.uid()) AND staff.is_active = true
    )
  );

ALTER POLICY caster_scenes_update ON public.caster_scenes
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_user_id = (select auth.uid()) AND staff.is_active = true
    )
  );

ALTER POLICY caster_scenes_delete ON public.caster_scenes
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_user_id = (select auth.uid()) AND staff.is_active = true
    )
  );

ALTER POLICY staff_select_own ON public.staff
  USING (auth_user_id = (select auth.uid()));

-- ── 2. Covering indexes for unindexed foreign keys ──────────────────────────

CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_by
  ON public.email_campaigns (created_by);
CREATE INDEX IF NOT EXISTS idx_event_stations_event_run_id
  ON public.event_stations (event_run_id);
CREATE INDEX IF NOT EXISTS idx_free_players_auth_user_id
  ON public.free_players (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_league_standings_team_id
  ON public.league_standings (team_id);
CREATE INDEX IF NOT EXISTS idx_league_standings_tenant_id
  ON public.league_standings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_league_tournaments_tenant_id
  ON public.league_tournaments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_team_id
  ON public.match_participants (team_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_tournament_id
  ON public.match_participants (tournament_id);
CREATE INDEX IF NOT EXISTS idx_player_rating_history_tournament_id
  ON public.player_rating_history (tournament_id);
CREATE INDEX IF NOT EXISTS idx_team_ratings_team_id
  ON public.team_ratings (team_id);

COMMIT;
