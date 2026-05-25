-- Migration: dispute SLA + escalation tracking (Lot 4 — Open Disputes Board)
--
-- WHY:
--   Today a match dispute can sit open forever without any prompt to the
--   staff that's supposed to resolve it. We need :
--     1. A configurable SLA per tenant (`tenants.dispute_sla_minutes`) so
--        each org sets its own "how long is too long".
--     2. A per-match marker (`matches.escalation_pinged_at`) so the SLA
--        cron / bot only DM staff ONCE per breach (idempotent escalation).
--
-- SCHEMA :
--   - `tenants.dispute_sla_minutes` INTEGER NOT NULL DEFAULT 60.
--     60 min = sane baseline (matches the human "go check it in an hour"
--     rhythm). Tenants override via Admin Tenants editor when needed.
--   - `matches.escalation_pinged_at` TIMESTAMPTZ NULL.
--     Set by /api/cron/dispute-sla-check when a breach is first detected
--     AND the outbox event `dispute.sla_breached` is emitted. Subsequent
--     cron ticks skip the match. Cleared when the dispute is resolved or
--     cancelled (so a re-opened dispute starts a fresh timer).
--
-- DEPLOY NOTES:
--   - Idempotent (IF NOT EXISTS on column add).
--   - No PostgREST schema cache reload needed (no FK / RLS policy change).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS dispute_sla_minutes INTEGER NOT NULL DEFAULT 60;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS chk_tenants_dispute_sla_positive;
ALTER TABLE public.tenants
  ADD CONSTRAINT chk_tenants_dispute_sla_positive
  CHECK (dispute_sla_minutes >= 1);

COMMENT ON COLUMN public.tenants.dispute_sla_minutes IS
  'Lot 4 : SLA en minutes avant escalade Discord pour les disputes ouvertes (default 60 min).';

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS escalation_pinged_at TIMESTAMPTZ;

COMMENT ON COLUMN public.matches.escalation_pinged_at IS
  'Lot 4 : timestamp du DM Discord d''escalade pour cette dispute. Posé par /api/cron/dispute-sla-check, reset à NULL quand la dispute est résolue/annulée. Garantit qu''on ne re-ping pas le staff plusieurs fois pour le même breach.';

-- Composite index pour la query du cron : trouver les matches `disputed`
-- ouverts depuis > SLA et jamais pingés. L'ordre des colonnes optimise pour
-- le predicate (status, escalation_pinged_at IS NULL) puis le tri par
-- dispute_opened_at.
CREATE INDEX IF NOT EXISTS idx_matches_sla_escalation_check
  ON public.matches (tenant_id, status, dispute_opened_at)
  WHERE status = 'disputed' AND escalation_pinged_at IS NULL;
