-- Migration: enforce STATUS / ROLE check constraints
--
-- WHY:
--   Locks the canonical enums for tournaments.status, matches.status, and
--   team_members.role at the database layer. Until now these were enforced
--   only in application code (apiHelpers.ts, dashboard state graphs, bot
--   VALID_STATUSES) which left room for casing drift and undocumented values
--   to slip in. Adds backfills + NOT NULL + CHECK in a single idempotent
--   migration so the data and the constraint always ship together.
--
-- PRODUCT-CANON ENUMS (decided 2026-05-20):
--   tournaments.status : draft, published, running, completed, archived,
--                        cancelled (canon = dashboard; bot was aligned).
--                        DEFAULT changes from 'upcoming' to 'draft'.
--   matches.status     : pending, ongoing, finished, cancelled, postponed,
--                        disputed, walkover (canon = add_match_status_values).
--   team_members.role  : player, coach, substitute, manager.
--
-- BACKFILLS APPLIED (audited 2026-05-20, idempotent — re-runs are no-ops):
--   - matches.status = 'completed' -> 'finished'      (7 rows)
--   - team_members.role = 'Player' -> 'player'        (1 row, casing)
--   - tournaments.status = 'upcoming' -> 'published'  (0 rows currently;
--     kept for safety in case a stale row appears between audit and apply.
--     If a real 'upcoming' tournament ever exists with a past start_date,
--     a follow-up migration must target it explicitly before this one runs.)
--
-- SKIPPED IN THIS MIGRATION (handled separately / no work needed):
--   - tournament_teams.status     : enum not yet decided with product.
--   - requests.status             : table empty, enum to be documented.
--   - partnership_requests.status : already has a CHECK constraint.
--
-- DEPLOY NOTES:
--   - No PostgREST schema cache reload needed (no FK touched).
--   - Order matters: backfills BEFORE SET NOT NULL BEFORE ADD CHECK.
--   - Safe to re-run; UPDATEs are no-ops on already-migrated data and the
--     CHECK constraints are dropped-and-recreated.

-- 1) Backfills (idempotent: zero rows on second run)
UPDATE matches       SET status = 'finished'  WHERE status = 'completed';
UPDATE team_members  SET role   = 'player'    WHERE role   = 'Player';
UPDATE tournaments   SET status = 'published' WHERE status = 'upcoming';

-- 2) Default realignment (tournaments was defaulting to a non-canon value)
ALTER TABLE tournaments ALTER COLUMN status SET DEFAULT 'draft';

-- 3) NOT NULL (status / role are required everywhere in code)
ALTER TABLE matches       ALTER COLUMN status SET NOT NULL;
ALTER TABLE tournaments   ALTER COLUMN status SET NOT NULL;
ALTER TABLE team_members  ALTER COLUMN role   SET NOT NULL;

-- 4) CHECK constraints (drop-and-recreate for idempotence)
ALTER TABLE matches DROP CONSTRAINT IF EXISTS chk_matches_status;
ALTER TABLE matches ADD CONSTRAINT chk_matches_status
  CHECK (status IN ('pending','ongoing','finished','cancelled','postponed','disputed','walkover'));

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS chk_tournaments_status;
ALTER TABLE tournaments ADD CONSTRAINT chk_tournaments_status
  CHECK (status IN ('draft','published','running','completed','archived','cancelled'));

ALTER TABLE team_members DROP CONSTRAINT IF EXISTS chk_team_members_role;
ALTER TABLE team_members ADD CONSTRAINT chk_team_members_role
  CHECK (role IN ('player','coach','substitute','manager'));
