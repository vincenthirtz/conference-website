-- Migration: composite indexes backing the admin demandes list endpoint
--            (audit perf P7 — index composite manquant sur `demandes`)
--
-- WHY:
--   The hot admin query in pages/api/admin/demandes/index.ts (handleGet) is
--   ALWAYS tenant-scoped and ordered, with two very common optional equality
--   filters:
--       WHERE tenant_id = ?            -- always (.eq('tenant_id', ctx.tenantId))
--         [AND status = ?]            -- optional (.eq('status', status))
--         [AND type   = ?]            -- optional (.eq('type', type))
--       ORDER BY created_at DESC       -- default sort (orderDir defaults to desc)
--       LIMIT/OFFSET                   -- server-side pagination (.range())
--   Today `demandes` only has SINGLE-column indexes (idx_demandes_user_id,
--   _team_id, _type, _status, _created_at DESC — see create_demandes_table.sql).
--   None of them covers "filter (tenant_id[, status|type]) + ordered range on
--   created_at", so the planner does a bitmap/seq scan followed by an in-memory
--   Sort + Limit on every admin page load. As the table grows this is the P7
--   regression flagged in the audit.
--
-- WHAT:
--   Two tenant-led composite indexes whose column order mirrors the handler's
--   (equality filters first, then the ORDER BY column last, DESC to match):
--     - idx_demandes_tenant_status_created (tenant_id, status, created_at DESC)
--     - idx_demandes_tenant_type_created   (tenant_id, type,   created_at DESC)
--   Both are ordered-range friendly: the leftmost prefix (tenant_id) alone also
--   serves the plain "all demandes for a tenant, newest first" listing, so the
--   status index doubles as the tenant-only ordered index (the pre-existing
--   single-column idx_demandes_created_at is NOT tenant-scoped and can't).
--
-- WHY TWO INDEXES (not one):
--   In the admin UI, filtering by `status` (default "pending" queue) and by
--   `type` (e.g. only caster_application / scrim / team_registration) are BOTH
--   first-class, independently-used filters in the handler — neither dominates.
--   A single (tenant_id, status, type, created_at) index would force a type-only
--   filter to scan every status bucket (leading columns not constrained), so it
--   wouldn't give an ordered range scan for the type-only path. Two focused
--   indexes keep each filter path a clean index range scan. A query combining
--   BOTH status AND type uses one composite for the ordered range and filters the
--   other equality as a cheap residual — acceptable at this table's volume; not
--   worth a speculative 4-column index.
--
-- DEDUP NOTES (verified against existing migrations before adding):
--   - create_demandes_table.sql ships ONLY single-column indexes; add_admin_
--     pagination_indexes.sql covered other admin lists but NOT `demandes`.
--   - demandes gained tenant_id via add_tenant_id_to_bot_ops_tables.sql /
--     enforce_tenant_id_not_null_and_fk.sql (NOT NULL + FK today), so leading
--     with tenant_id is safe and always selective.
--   - We do NOT drop the existing single-column idx_demandes_status /
--     idx_demandes_type / idx_demandes_created_at: they still back non-admin
--     paths (bot, /api/demandes*) and are cheap.
--
-- DEPLOY NOTES:
--   - Idempotent (CREATE INDEX IF NOT EXISTS).
--   - Additive, no FK / RLS policy change → NO PostgREST schema cache reload.
--   - We deliberately do NOT use CONCURRENTLY: this repo runs migrations inside
--     a single transaction (see add_admin_pagination_indexes.sql /
--     add_missing_fk_indexes.sql), incompatible with CONCURRENTLY. At current
--     volumes the brief lock is a non-issue; revisit only if demandes grows large.

BEGIN;

-- Default admin queue: tenant + status (e.g. "pending"), newest first.
-- Leftmost prefix (tenant_id) also serves the tenant-only ordered listing.
CREATE INDEX IF NOT EXISTS idx_demandes_tenant_status_created
  ON public.demandes (tenant_id, status, created_at DESC);

-- Type-filtered admin views: tenant + type (scrim / caster_application / …),
-- newest first.
CREATE INDEX IF NOT EXISTS idx_demandes_tenant_type_created
  ON public.demandes (tenant_id, type, created_at DESC);

COMMIT;
