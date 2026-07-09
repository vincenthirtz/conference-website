-- Migration: billing plan on tenants (modèle « Régie solidaire », Phase 0)
--
-- WHY: monétiser l'accès plateforme (tenant white-label + API) tout en gardant
--   le tenant flagship (Coupe féminine) 100% gratuit. Les régies payantes
--   financent la Coupe gratuite. Facturation via HelloAsso (Phase 1).
--
-- WHAT (additif, non-destructif) :
--   - plan            : niveau d'offre. Défaut 'discovery' (gratuit, marque
--                       partagée, PAS d'API ni de white-label).
--   - plan_status     : 'active' | 'past_due' | 'canceled'.
--   - plan_started_at : début de l'abonnement en cours.
--   - plan_expires_at : fin d'entitlement (NULL = illimité, ex. foundation).
--
--   Le seul tenant existant ('conference' = Coupe féminine) est basculé en
--   'foundation' : accès complet, gratuit, sans expiration (la mission).
--   Les gating (API/white-label/multi-tenant) lisent ces colonnes via
--   utils/billing/planFeatures.ts. Pas de reload de cache PostgREST (pas de FK).

BEGIN;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'discovery',
  ADD COLUMN IF NOT EXISTS plan_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS plan_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_plan_check') THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_plan_check
      CHECK (plan IN ('foundation','discovery','regie','circuit','editor'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_plan_status_check') THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_plan_status_check
      CHECK (plan_status IN ('active','past_due','canceled'));
  END IF;
END $$;

-- Flagship (Coupe féminine) : plan Fondation, gratuit à vie, sans expiration.
UPDATE public.tenants
SET plan = 'foundation',
    plan_status = 'active',
    plan_started_at = COALESCE(plan_started_at, created_at),
    plan_expires_at = NULL
WHERE slug = 'conference';

COMMIT;
