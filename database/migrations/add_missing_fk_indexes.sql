-- Migration: add btree indexes on every foreign-key column lacking one
--
-- WHY:
--   The performance advisor reported 27 foreign keys without a covering index.
--   FKs without an index force sequential scans on the referenced side during
--   cascade/restrict checks AND during JOINs that go through the FK column.
--   For hot-path joins (matches.team1_id, team_members.user_id), this is a
--   measurable cost at very small scale already.
--
-- WHAT:
--   `CREATE INDEX IF NOT EXISTS` a btree on the FK column. One per FK.
--   We do NOT use CONCURRENTLY (incompatible with the migration transaction).
--
-- SAFE because CREATE INDEX IF NOT EXISTS is idempotent and additive.

BEGIN;

-- bracket_snapshots
CREATE INDEX IF NOT EXISTS idx_bracket_snapshots_taken_by_staff_id
  ON public.bracket_snapshots (taken_by_staff_id);

-- broadcast_schedules
CREATE INDEX IF NOT EXISTS idx_broadcast_schedules_created_by
  ON public.broadcast_schedules (created_by);

-- demandes
CREATE INDEX IF NOT EXISTS idx_demandes_processed_by_staff_id
  ON public.demandes (processed_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_demandes_team_id
  ON public.demandes (team_id);
CREATE INDEX IF NOT EXISTS idx_demandes_tournament_id
  ON public.demandes (tournament_id);

-- match_map_vetos
CREATE INDEX IF NOT EXISTS idx_match_map_vetos_team_id
  ON public.match_map_vetos (team_id);

-- match_mvp_polls
CREATE INDEX IF NOT EXISTS idx_match_mvp_polls_winner_imported_by
  ON public.match_mvp_polls (winner_imported_by);
CREATE INDEX IF NOT EXISTS idx_match_mvp_polls_winner_member_id
  ON public.match_mvp_polls (winner_member_id);

-- matches (hot-path joins)
CREATE INDEX IF NOT EXISTS idx_matches_parent_match_lose_id
  ON public.matches (parent_match_lose_id);
CREATE INDEX IF NOT EXISTS idx_matches_parent_match_win_id
  ON public.matches (parent_match_win_id);
CREATE INDEX IF NOT EXISTS idx_matches_team1_id
  ON public.matches (team1_id);
CREATE INDEX IF NOT EXISTS idx_matches_team2_id
  ON public.matches (team2_id);
CREATE INDEX IF NOT EXISTS idx_matches_winner_team_id
  ON public.matches (winner_team_id);

-- news
CREATE INDEX IF NOT EXISTS idx_news_author_id
  ON public.news (author_id);

-- requests
CREATE INDEX IF NOT EXISTS idx_requests_tournament_id
  ON public.requests (tournament_id);
CREATE INDEX IF NOT EXISTS idx_requests_user_id
  ON public.requests (user_id);

-- site_settings
CREATE INDEX IF NOT EXISTS idx_site_settings_updated_by
  ON public.site_settings (updated_by);

-- staff_logs
CREATE INDEX IF NOT EXISTS idx_staff_logs_staff_id
  ON public.staff_logs (staff_id);

-- stage_tiebreaker_overrides
CREATE INDEX IF NOT EXISTS idx_stage_tiebreaker_overrides_loser_team_id
  ON public.stage_tiebreaker_overrides (loser_team_id);
CREATE INDEX IF NOT EXISTS idx_stage_tiebreaker_overrides_set_by_staff_id
  ON public.stage_tiebreaker_overrides (set_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_stage_tiebreaker_overrides_winner_team_id
  ON public.stage_tiebreaker_overrides (winner_team_id);

-- support_tickets
CREATE INDEX IF NOT EXISTS idx_support_tickets_reporter_user_id
  ON public.support_tickets (reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_resolved_by
  ON public.support_tickets (resolved_by);

-- team_members
CREATE INDEX IF NOT EXISTS idx_team_members_user_id
  ON public.team_members (user_id);

-- teams
CREATE INDEX IF NOT EXISTS idx_teams_captain_id
  ON public.teams (captain_id);

-- tournament_stage_teams (named tournament_stage_teams in pg)
CREATE INDEX IF NOT EXISTS idx_tournament_stage_teams_team_id
  ON public.tournament_stage_teams (team_id);

-- tournament_stages
CREATE INDEX IF NOT EXISTS idx_tournament_stages_tournament_id
  ON public.tournament_stages (tournament_id);

COMMIT;
