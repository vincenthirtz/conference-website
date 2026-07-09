-- Migration: tenant plan billing (« Régie solidaire », Phase 1)
--
-- WHY: brancher un don HelloAsso ciblé (tenant + plan) sur l'activation /
--   renouvellement automatique du plan d'un tenant. Un owner génère un lien de
--   paiement ; le partenaire « fait un don » ; le webhook active le plan.
--
-- Deux tables INTERNES (jamais exposées à un client anon/auth) :
--
--   tenant_plan_checkouts
--     Mapping écrit à la génération du lien : checkout_intent_id → tenant/plan.
--     Sert de FALLBACK de corrélation (si la metadata HelloAsso n'était pas
--     renvoyée) et d'audit opérationnel (quels liens générés, par qui).
--
--   tenant_plan_payments
--     Ledger d'idempotence : chaque helloasso_payment_id n'est appliqué qu'une
--     fois (colonne UNIQUE). Un rejeu du webhook ne ré-étend pas l'abonnement.
--
-- Ces tables ne sont manipulées que par le service role (supabaseAdmin) depuis
-- l'endpoint owner et le webhook. RLS ENABLE sans policy → invisibles via
-- PostgREST anon/auth (aligné sur admin_idempotency).

BEGIN;

-- ─── Mapping checkout-intent → tenant/plan (fallback + audit) ────────────────
CREATE TABLE IF NOT EXISTS public.tenant_plan_checkouts (
  id BIGSERIAL PRIMARY KEY,
  -- Id du checkout-intent renvoyé par HelloAsso à la création.
  checkout_intent_id BIGINT NOT NULL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  -- Montant attendu, EN CENTIMES (aligné sur HelloAsso).
  amount_expected INTEGER NOT NULL,
  -- Staff (owner) qui a généré le lien. Pas de FK stricte : la table staff peut
  -- vivre dans un autre périmètre ; on garde juste la trace.
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_plan_checkouts_plan_check
    CHECK (plan IN ('regie', 'circuit'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_plan_checkouts_tenant
  ON public.tenant_plan_checkouts (tenant_id);

ALTER TABLE public.tenant_plan_checkouts ENABLE ROW LEVEL SECURITY;
-- Pas de policy = rien d'accessible via les clients anon/auth.

-- ─── Ledger d'idempotence des paiements plan ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_plan_payments (
  id BIGSERIAL PRIMARY KEY,
  -- Id du paiement HelloAsso. UNIQUE = clé d'idempotence : un rejeu ne réapplique pas.
  helloasso_payment_id BIGINT NOT NULL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  -- Montant payé, EN CENTIMES.
  amount INTEGER NOT NULL,
  -- Checkout-intent d'origine, si connu (nullable : corrélation par metadata pure).
  checkout_intent_id BIGINT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_plan_payments_plan_check
    CHECK (plan IN ('regie', 'circuit'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_plan_payments_tenant
  ON public.tenant_plan_payments (tenant_id);

ALTER TABLE public.tenant_plan_payments ENABLE ROW LEVEL SECURITY;
-- Pas de policy = rien d'accessible via les clients anon/auth.

COMMIT;
