-- Migration: composite indexes backing the admin alerts badge (light path)
--
-- WHY:
--   utils/dashboard/alertsSignals.ts + pages/api/admin/alerts-summary.ts power
--   the navbar alerts badge (components/Navbar/AdminTopBar.tsx). That badge is
--   mounted on EVERY /admin/* page and polled ~every 60 s (+ realtime), so its
--   handful of filtered counts are among the most frequently executed reads in
--   the app. Three of those counts hit a (filter) shape that the current index
--   set only partially covers (leading column only), forcing the planner to
--   fall back to heap filters / bitmap-ANDs. These composite / partial indexes
--   match the EXACT predicate shape of each count so the planner can do a
--   narrow index range scan. Same "match the exact (filter) shape" rationale as
--   add_admin_pagination_indexes.sql.
--
-- WHAT:
--   `CREATE INDEX IF NOT EXISTS` (idempotent, additive). Non-destructive: no
--   DROP, no data/column change. We deliberately do NOT use CONCURRENTLY: this
--   repo runs migrations inside a single transaction (see
--   add_missing_fk_indexes.sql / add_admin_pagination_indexes.sql), and
--   CONCURRENTLY is incompatible with that. At current data volumes the brief
--   table lock at apply time is a non-issue; revisit CONCURRENTLY only if one
--   of these tables grows large.
--
-- QUERY SHAPES (verified against utils/dashboard/alertsSignals.ts, the light
--   path that the badge actually calls; identical count queries to the full
--   builder utils/dashboard/buildTournamentDashboard.ts):
--
--   pendingTeams:
--     tournament_teams  WHERE tournament_id = ? AND tenant_id = ?
--                             AND status = 'pending'                 [count head]
--   supportHigh:
--     support_tickets   WHERE tournament_id = ? AND severity = 'high'
--                             AND status = 'open'                    [count head]
--   activeMvpPolls:
--     match_mvp_polls   WHERE tenant_id = ? AND winner_member_id IS NULL
--                       JOIN matches!inner ON match_id
--                       AND matches.tournament_id = ?
--
-- DEDUP NOTES (verified against existing repo migrations before adding — the
--   base matches / tournament_teams tables predate database/migrations/, so
--   their index set was reconstructed from every migration that touches them):
--
--   - tournament_teams: add_unique_tournament_team.sql ships a UNIQUE
--     (tournament_id, team_id) constraint (leads with tournament_id) and
--     add_tenant_id_to_match_domain.sql ships idx_tournament_teams_tenant_id
--     (tenant_id). Neither serves the `status = 'pending'` discriminator: the
--     unique index only narrows by tournament_id (its 2nd column is team_id,
--     not status), so the pending filter is a heap check per team. The new
--     (tournament_id, status) turns the count into a direct range scan on the
--     pending rows of the tournament. tenant_id is intentionally OMITTED from
--     the index: a tournament_id maps to exactly one tenant, so the tenant_id
--     equality is redundant once tournament_id is fixed.
--
--   - support_tickets: create_support_tickets_table.sql ships only
--     single-column indexes support_tickets_tournament_idx (tournament_id),
--     support_tickets_severity_idx (severity), support_tickets_status_idx
--     (status). The supportHigh count filters all three by equality; a single
--     composite (tournament_id, severity, status) beats a 3-way bitmap-AND and
--     lets the count be served straight from the index. tournament_id leads
--     (most selective equality). NOTE: this query does NOT filter tenant_id, so
--     tenant_id is (correctly) absent from the index.
--
--   - match_mvp_polls: create_match_mvp_polls_table.sql ships UNIQUE(match_id)
--     (one poll per match). add_tenant_id_to_match_domain.sql ships
--     idx_match_mvp_polls_tenant_id (tenant_id). add_missing_fk_indexes.sql
--     ships idx_match_mvp_polls_winner_member_id (winner_member_id).
--     drop_duplicate_indexes.sql dropped match_mvp_polls_match_idx (dup of the
--     UNIQUE). NONE of these matches the "active polls for a tenant" shape:
--     tenant_id equality + winner_member_id IS NULL, then join to matches on
--     match_id. The new PARTIAL (tenant_id, match_id) WHERE
--     winner_member_id IS NULL indexes only OPEN polls (winner unset) and
--     carries match_id so the matches!inner embed join is index-served.
--
--   - matches (proposed `(tournament_id, status)` — NOT ADDED, on purpose):
--     the alerts matches query filters matches ONLY by tournament_id (+ the
--     redundant tenant_id) and fetches all rows for the tournament, computing
--     disputes / conflicts / check-in / stagesReady in JS from status in the
--     result set. There is NO DB-level status predicate on matches here, so
--     (tournament_id, status) would give zero benefit over the existing plain
--     tournament_id coverage (matches.tournament_id was NOT among the 27
--     unindexed FKs flagged in add_missing_fk_indexes.sql, i.e. it already has
--     a covering index). The disputed board that DOES filter status is served
--     separately by matches_disputed_idx (tournament_id, dispute_opened_at)
--     WHERE status='disputed'. Adding (tournament_id, status) would be a
--     speculative index → SKIPPED.
--
-- DEPLOY NOTES:
--   - Idempotent (CREATE INDEX IF NOT EXISTS); safe to re-run.
--   - No FK / RLS policy change → NO PostgREST schema cache reload needed.
--   - Applied to prod via Supabase MCP apply_migration (same as sibling index
--     migrations) — NOT applied by this change; ship the .sql and apply
--     separately.

BEGIN;

-- ---------------------------------------------------------------------------
-- pendingTeams count: tournament_teams WHERE tournament_id = ? AND status = ?
-- (tenant_id omitted — redundant once tournament_id is fixed)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament_status
  ON public.tournament_teams (tournament_id, status);

-- ---------------------------------------------------------------------------
-- supportHigh count: support_tickets WHERE tournament_id = ?
--                    AND severity = 'high' AND status = 'open'
-- (tournament_id leads — most selective equality; query has no tenant_id)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_support_tickets_tournament_severity_status
  ON public.support_tickets (tournament_id, severity, status);

-- ---------------------------------------------------------------------------
-- activeMvpPolls: match_mvp_polls WHERE tenant_id = ? AND winner_member_id
--                 IS NULL, joined to matches on match_id. Partial on the
--                 "open poll" predicate; match_id carries the embed join.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_match_mvp_polls_active_by_tenant
  ON public.match_mvp_polls (tenant_id, match_id)
  WHERE winner_member_id IS NULL;

COMMIT;
