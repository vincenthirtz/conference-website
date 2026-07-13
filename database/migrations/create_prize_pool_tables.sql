-- Migration: prize-pool crowdfunding (« Profondeur de la monétisation » — cash-prize crowdfundé)
--
-- WHY:
--   Un organisateur veut une cagnotte de prize-pool par tournoi, alimentée par
--   des contributions HelloAsso. Le supporter « fait un don » ciblé sur un
--   tournoi ; le webhook HelloAsso confirme le paiement et incrémente la
--   cagnotte. Analogue direct du billing tenant-plan (add_tenant_plan_billing_tables.sql) :
--   même patron checkout-corrélation + ledger d'idempotence.
--
--   Trois tables INTERNES (jamais exposées à un client anon/auth), manipulées
--   uniquement par le service role (supabaseAdmin) depuis l'endpoint organisateur
--   et le webhook HelloAsso.
--
-- SCHEMA:
--   tournament_prize_pools
--     Config + total dénormalisé, UNE cagnotte par tournoi (UNIQUE tournament_id).
--     Total AFFICHÉ = base_amount_cents + raised_amount_cents.
--       - base_amount_cents   : seed / base garantie posée par l'organisateur.
--       - raised_amount_cents : somme dénormalisée des contributions confirmées,
--                               incrémentée idempotemment par le webhook. La table
--                               prize_pool_contributions reste la source de vérité.
--       - goal_amount_cents   : objectif de collecte optionnel (NULL = pas d'objectif).
--       - is_open             : accepte ou non de nouvelles contributions.
--
--   prize_pool_checkouts
--     Intent en attente : on capture le nom / message / anonymat du contributeur
--     AU MOMENT du checkout, car le payload de paiement HelloAsso ne les portera
--     pas. On les stocke keyé par checkout_intent_id, puis on les promeut en
--     contribution à la confirmation. Miroir de tenant_plan_checkouts.
--
--   prize_pool_contributions
--     Ledger d'idempotence des contributions confirmées. helloasso_payment_id
--     UNIQUE = clé d'idempotence : un rejeu du webhook ne recrédite pas la
--     cagnotte deux fois. Miroir exact de tenant_plan_payments.helloasso_payment_id.
--
-- RLS:
--   ENABLE ROW LEVEL SECURITY sur les trois tables, ZÉRO policy → invisibles via
--   PostgREST anon/auth (aligné sur tenant_plan_checkouts / tenant_plan_payments /
--   match_score_reports). Accès exclusivement service_role.
--
-- POSTGREST FK NAMES (embeds côté API) :
--   Les FK sont déclarées inline → Postgres génère les noms standard
--   <table>_<colonne>_fkey attendus par PostgREST :
--     - tournament_prize_pools_tournament_id_fkey
--     - tournament_prize_pools_tenant_id_fkey
--     - prize_pool_checkouts_prize_pool_id_fkey
--     - prize_pool_checkouts_tenant_id_fkey
--     - prize_pool_contributions_prize_pool_id_fkey
--     - prize_pool_contributions_tenant_id_fkey
--
-- DEPLOY NOTES:
--   - Idempotent : CREATE TABLE/INDEX IF NOT EXISTS, re-runnable sans cleanup.
--   - tenant_id -> tenants(id) ON DELETE RESTRICT (convention repo,
--     cf. enforce_tenant_id_not_null_and_fk.sql : pas de cascade silencieuse
--     sur suppression de tenant).
--   - tournament_id / prize_pool_id -> ON DELETE CASCADE (la cagnotte et ses
--     traces disparaissent avec le tournoi / la cagnotte).
--   - Ajout de FK => reload du cache PostgREST REQUIS pour exposer les embeds :
--     NOTIFY pgrst en fin + Supabase Studio → Settings → API → Reload schema.

BEGIN;

-- ─── Cagnotte : config + total dénormalisé (une par tournoi) ─────────────────
CREATE TABLE IF NOT EXISTS public.tournament_prize_pools (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id      UUID NOT NULL UNIQUE
                       REFERENCES public.tournaments(id) ON DELETE CASCADE,
  tenant_id          UUID NOT NULL
                       REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title              TEXT,
  currency           TEXT NOT NULL DEFAULT 'EUR',
  -- Objectif de collecte optionnel : strictement positif quand renseigné.
  goal_amount_cents  INTEGER CHECK (goal_amount_cents IS NULL OR goal_amount_cents > 0),
  -- Base garantie posée par l'organisateur (seed).
  base_amount_cents  INTEGER NOT NULL DEFAULT 0 CHECK (base_amount_cents >= 0),
  -- Somme dénormalisée des contributions confirmées (source de vérité = table
  -- prize_pool_contributions ; incrémentée idempotemment par le webhook).
  raised_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (raised_amount_cents >= 0),
  is_open            BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_prize_pools_tenant
  ON public.tournament_prize_pools (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tournament_prize_pools_tournament
  ON public.tournament_prize_pools (tournament_id);

ALTER TABLE public.tournament_prize_pools ENABLE ROW LEVEL SECURITY;
-- Pas de policy = invisible via anon/auth ; service_role uniquement.

-- ─── Checkout-intent en attente → cagnotte + inputs contributeur ─────────────
CREATE TABLE IF NOT EXISTS public.prize_pool_checkouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Id du checkout-intent HelloAsso (clé de corrélation vers le webhook).
  checkout_intent_id TEXT NOT NULL UNIQUE,
  prize_pool_id      UUID NOT NULL
                       REFERENCES public.tournament_prize_pools(id) ON DELETE CASCADE,
  tenant_id          UUID NOT NULL
                       REFERENCES public.tenants(id) ON DELETE RESTRICT,
  amount_cents       INTEGER NOT NULL CHECK (amount_cents > 0),
  contributor_name   TEXT,
  -- Email privé : jamais exposé publiquement.
  contributor_email  TEXT,
  message            TEXT,
  is_anonymous       BOOLEAN NOT NULL DEFAULT false,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'confirmed', 'expired')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prize_pool_checkouts_pool
  ON public.prize_pool_checkouts (prize_pool_id);
CREATE INDEX IF NOT EXISTS idx_prize_pool_checkouts_tenant
  ON public.prize_pool_checkouts (tenant_id);

ALTER TABLE public.prize_pool_checkouts ENABLE ROW LEVEL SECURITY;
-- Pas de policy = invisible via anon/auth ; service_role uniquement.

-- ─── Ledger d'idempotence des contributions confirmées ──────────────────────
CREATE TABLE IF NOT EXISTS public.prize_pool_contributions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_pool_id       UUID NOT NULL
                        REFERENCES public.tournament_prize_pools(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL
                        REFERENCES public.tenants(id) ON DELETE RESTRICT,
  -- Id du paiement HelloAsso. UNIQUE = clé d'idempotence : un rejeu du webhook
  -- ne recrédite pas la cagnotte (miroir de tenant_plan_payments).
  helloasso_payment_id TEXT NOT NULL UNIQUE,
  -- Corrélation vers le checkout d'origine, si connu.
  checkout_intent_id  TEXT,
  amount_cents        INTEGER NOT NULL CHECK (amount_cents > 0),
  -- Snapshot pour affichage (le checkout peut être purgé, la contribution reste).
  contributor_name    TEXT,
  is_anonymous        BOOLEAN NOT NULL DEFAULT false,
  message             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prize_pool_contributions_pool
  ON public.prize_pool_contributions (prize_pool_id);
CREATE INDEX IF NOT EXISTS idx_prize_pool_contributions_tenant
  ON public.prize_pool_contributions (tenant_id);

ALTER TABLE public.prize_pool_contributions ENABLE ROW LEVEL SECURITY;
-- Pas de policy = invisible via anon/auth ; service_role uniquement.

COMMIT;

-- Recharge le cache PostgREST pour exposer les nouvelles FK aux embeds
-- (?select=*,tournament_prize_pools(*) etc.). Étape INVISIBLE depuis le SQL :
-- à confirmer côté Supabase Studio → Settings → API → Reload schema.
NOTIFY pgrst, 'reload schema';
