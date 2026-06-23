-- Migration: indexes backing the hardened admin list endpoints
--            (server-side pagination / filter / sort)
--
-- WHY:
--   We just moved the admin list endpoints (recycle-bin, disputes board,
--   adherents stats, cast-members / announcements default lists, broadcast,
--   logs) from "fetch-all + filter in JS" to server-side pagination with
--   tenant scoping, predicate filters and explicit ORDER BY. Each of those
--   query paths now hits Postgres with a WHERE + ORDER BY that the current
--   index set does not cover, forcing seq scans + in-memory sorts. These
--   composite / partial indexes are built to match the exact (filter, order)
--   shape of each endpoint so the planner can do an index-only range scan.
--
-- WHAT:
--   `CREATE INDEX IF NOT EXISTS` (idempotent, additive). We deliberately do
--   NOT use CONCURRENTLY: this repo runs migrations inside a single
--   transaction (see add_missing_fk_indexes.sql), and CONCURRENTLY is
--   incompatible with that. At current data volumes the brief table lock is
--   a non-issue; revisit with CONCURRENTLY only if a table grows large.
--
-- DEDUP NOTES (verified against existing migrations before adding):
--   - Recycle-bin: deleted_at_migration.sql already ships single-column
--     partial indexes `idx_<table>_deleted_at ON <table>(deleted_at)
--     WHERE deleted_at IS NOT NULL` for teams / tournament_stages / matches /
--     announcements / partners / cast_members / adherents. Those are NOT
--     tenant-scoped and NOT ordered. The new recycle-bin indexes lead with
--     tenant_id and add `deleted_at DESC` so the per-tenant recycle-bin list
--     ("ORDER BY deleted_at DESC") is a pure index range scan. The old
--     single-column indexes are left in place (cheap, still used by the
--     bare deleted_at IS NOT NULL predicate); we are NOT dropping them here.
--   - scrims: add_scrims_soft_delete_and_settings.sql already ships
--     `idx_scrims_deleted_at` (partial). SKIPPED — not upgrading to a
--     tenant-scoped composite in this migration to avoid index churn; the
--     scrims recycle-bin volume is low and the existing partial suffices.
--   - matches disputes: add_dispute_columns_to_matches.sql ships
--     `matches_disputed_idx ON matches(tournament_id, dispute_opened_at)
--     WHERE status = 'disputed'` (leads with tournament_id) and
--     add_dispute_sla_escalation.sql ships `idx_matches_sla_escalation_check
--     ON matches(tenant_id, status, dispute_opened_at)
--     WHERE status='disputed' AND escalation_pinged_at IS NULL` (only
--     un-pinged rows — useless for the full admin board). Neither covers the
--     tenant-scoped board listing ALL open disputes, so we add a dedicated
--     `(tenant_id, dispute_opened_at) WHERE status='disputed'` index.
--   - announcements: announcements.sql ships
--     `announcements_active_priority_idx ON (is_active, priority DESC,
--     created_at DESC)` — NOT tenant-scoped. The new tenant-led composites
--     match the multi-tenant default list queries.
--   - cast_members: create_cast_members_table.sql ships
--     `idx_cast_members_active_order ON (is_active, sort_order)` — NOT
--     tenant-scoped. New `(tenant_id, is_active, sort_order)` matches the
--     scoped default list.
--   - adherents: create_adherents_table.sql ships
--     `idx_adherents_payment_status ON (current_year, payment_status)` and
--     `idx_adherents_active ON (is_active, current_year)`. Neither matches
--     the stats-count shape `(is_active, payment_status)`, so we add it.
--     adherents has NO `role` index today, so we add `(role)`.
--     (adherents has NO tenant_id column — it is association-scoped, not
--     tenant-scoped; recycle-bin index is plain `(deleted_at DESC)`.)
--   - partners: has NO tenant_id column (not part of the tier-1 tenant
--     backfill). Recycle-bin index is plain `(deleted_at DESC)`.
--     Existing `idx_partners_category_order` / `idx_partners_active` already
--     cover the public + default list paths per the endpoint authors — not
--     touched here.
--   - broadcast_recipients: PK is `(campaign_id, user_id)` and
--     `broadcast_recipients_pending_idx` is partial WHERE status='pending'.
--     Neither covers "group/filter by status across all statuses for a
--     campaign", so we add `(campaign_id, status)`.
--   - staff_logs: existing indexes are single-column `idx_staff_logs_tenant_id`,
--     `idx_staff_logs_staff_id`, `idx_staff_logs_tournament_id`. The logs
--     endpoint (pages/api/admin/logs.ts) filters by tenant_id [+ optional
--     entity_type] and orders by created_at DESC, so we add the composite
--     `(tenant_id, entity_type, created_at DESC)`.
--
-- DEPLOY NOTES:
--   - Idempotent (CREATE INDEX IF NOT EXISTS).
--   - No FK / RLS policy change → NO PostgREST schema cache reload needed.

BEGIN;

-- ---------------------------------------------------------------------------
-- Recycle-bin (soft-delete) — tenant-scoped, ordered by deleted_at DESC
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tournament_stages_tenant_deleted_at
  ON public.tournament_stages (tenant_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teams_tenant_deleted_at
  ON public.teams (tenant_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_matches_tenant_deleted_at
  ON public.matches (tenant_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_tenant_deleted_at
  ON public.announcements (tenant_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cast_members_tenant_deleted_at
  ON public.cast_members (tenant_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- partners / adherents have NO tenant_id → plain deleted_at DESC ordering.
CREATE INDEX IF NOT EXISTS idx_partners_deleted_at_desc
  ON public.partners (deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_adherents_deleted_at_desc
  ON public.adherents (deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- staff recycle-bin: a row is "in the bin" when deactivated OR soft-deleted.
CREATE INDEX IF NOT EXISTS idx_staff_recycle_bin
  ON public.staff (deleted_at DESC)
  WHERE is_active = false OR deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Disputes board — all OPEN disputes for a tenant, oldest-first
-- (distinct from matches_disputed_idx [tournament_id-led] and
--  idx_matches_sla_escalation_check [un-pinged only])
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_matches_tenant_dispute_open
  ON public.matches (tenant_id, dispute_opened_at)
  WHERE status = 'disputed';

-- ---------------------------------------------------------------------------
-- Adherents stats counts (scoped on active members)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_adherents_active_payment_status
  ON public.adherents (is_active, payment_status);

CREATE INDEX IF NOT EXISTS idx_adherents_role
  ON public.adherents (role);

-- ---------------------------------------------------------------------------
-- Cast-members default list (tenant-scoped, active, ordered by sort_order)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cast_members_tenant_active_sort
  ON public.cast_members (tenant_id, is_active, sort_order);

-- ---------------------------------------------------------------------------
-- Announcements default lists (tenant-scoped)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_announcements_tenant_priority_created
  ON public.announcements (tenant_id, priority DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_announcements_tenant_active_created
  ON public.announcements (tenant_id, is_active, created_at DESC);

-- ---------------------------------------------------------------------------
-- Broadcast — recipients filtered/grouped by status within a campaign
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_campaign_status
  ON public.broadcast_recipients (campaign_id, status);

-- ---------------------------------------------------------------------------
-- Staff logs — admin logs endpoint: tenant + optional entity_type, newest first
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_staff_logs_tenant_entity_created
  ON public.staff_logs (tenant_id, entity_type, created_at DESC);

COMMIT;
