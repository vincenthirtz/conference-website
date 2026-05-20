-- Migration: drop duplicate / redundant indexes
--
-- WHY:
--   The performance advisor flagged several pairs of identical indexes
--   (same columns, same predicate) and a few "covering duplicates" where
--   a UNIQUE index already covers a non-unique one for FK lookups.
--   Duplicate indexes waste disk, slow down writes, and confuse the planner.
--
-- WHAT:
--   Drop the redundant member of each pair, keeping the canonical / unique one.
--
-- SAFE because each `DROP INDEX IF EXISTS` is idempotent and the kept index
--   provides identical or strictly broader coverage for every query.

BEGIN;

-- ----------------------------------------------------------------------
-- demandes: 3 duplicates flagged by advisor + 1 user_id redundancy
-- ----------------------------------------------------------------------
-- demandes_user_id_idx is on auth_user_id, identical to demandes_auth_user_id_idx
DROP INDEX IF EXISTS public.demandes_user_id_idx;
-- idx_demandes_status / demandes_status_idx are identical -> keep demandes_status_idx
DROP INDEX IF EXISTS public.idx_demandes_status;
-- idx_demandes_type / demandes_type_idx are identical -> keep demandes_type_idx
DROP INDEX IF EXISTS public.idx_demandes_type;
-- demandes_auth_user_id_idx is unindexed-FK-style; idx_demandes_user_id covers
-- demandes(user_id). We KEEP demandes_auth_user_id_idx (FK index for auth_user_id)
-- and do NOT drop it; only drop the duplicate scanning the same column.

-- ----------------------------------------------------------------------
-- tournament_teams: identical unique indexes
-- ----------------------------------------------------------------------
-- tournament_teams_tournament_id_team_id_key and uq_tournament_teams_tournament_team
-- both impose unique (tournament_id, team_id). Both are backed by CONSTRAINTs, so
-- the index cannot be DROP'd directly — we drop the CONSTRAINT instead.
-- Keep the *_key version (auto-named by Postgres) and drop the manually added one.
ALTER TABLE public.tournament_teams DROP CONSTRAINT IF EXISTS uq_tournament_teams_tournament_team;

-- ----------------------------------------------------------------------
-- site_settings: idx_site_settings_key duplicates site_settings_pkey
-- ----------------------------------------------------------------------
-- pkey is on (key) (text PK), idx_site_settings_key duplicates it.
DROP INDEX IF EXISTS public.idx_site_settings_key;

-- ----------------------------------------------------------------------
-- user_discord_links: discord_user_id_idx duplicates the UNIQUE *_key index
-- ----------------------------------------------------------------------
DROP INDEX IF EXISTS public.user_discord_links_discord_user_id_idx;

-- ----------------------------------------------------------------------
-- match_mvp_polls: match_idx duplicates the UNIQUE match_id_key
-- ----------------------------------------------------------------------
DROP INDEX IF EXISTS public.match_mvp_polls_match_idx;

-- ----------------------------------------------------------------------
-- discord_webhooks: lookup_idx redundant with the two UNIQUE partial indexes
-- ----------------------------------------------------------------------
-- discord_webhooks_lookup_idx is (tournament_id, channel_type) WHERE is_active=true
-- discord_webhooks_tournament_channel_uidx is (tournament_id, channel_type) WHERE tournament_id IS NOT NULL
-- The unique partial index covers all lookups that are_active=true would benefit from,
-- and the global_channel_uidx covers the tournament_id IS NULL case. Drop the duplicate.
DROP INDEX IF EXISTS public.discord_webhooks_lookup_idx;

-- ----------------------------------------------------------------------
-- adherents: redundant single-column indexes on email and auth_user_id
-- ----------------------------------------------------------------------
-- adherents_email_key (UNIQUE) covers idx_adherents_email completely.
DROP INDEX IF EXISTS public.idx_adherents_email;
-- adherents_auth_user_id_key (UNIQUE) covers idx_adherents_auth_user.
DROP INDEX IF EXISTS public.idx_adherents_auth_user;

-- ----------------------------------------------------------------------
-- staff: staff_email_idx duplicates staff_email_key UNIQUE index
-- ----------------------------------------------------------------------
DROP INDEX IF EXISTS public.staff_email_idx;

-- ----------------------------------------------------------------------
-- cast_assignments: briefing_at vs unacked partial
-- ----------------------------------------------------------------------
-- cast_assignments_briefing_at_idx covers (briefing_at) for ALL rows.
-- idx_cast_assignments_unacked covers (briefing_at) WHERE acked_at IS NULL — strict subset.
-- They are NOT redundant: the partial index is much smaller and is the hot path
-- (querying unacked assignments). The full index serves any range scan on briefing_at.
-- DO NOT DROP either — coverage genuinely differs.

COMMIT;
