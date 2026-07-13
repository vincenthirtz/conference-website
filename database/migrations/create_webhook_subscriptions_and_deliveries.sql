-- Migration: webhooks sortants tiers — abonnements + journal de livraison
-- Date: 2026-07-13
--
-- WHY:
--   Écosystème développeur : permettre à une orga tierce d'ABONNER une URL et de
--   recevoir nos events (match.finished, tournament.finalized, …) en POST signé
--   HMAC. On suit le pattern « outbox-as-fan-out-source » déjà en place : le
--   dispatcher webhook lit `bot_event_outbox` en READ-ONLY (comme les crons
--   web-push / email-digest) et suit SON PROPRE état de livraison ici — il ne
--   TOUCHE JAMAIS `bot_event_outbox.status` (propriété du bot Discord).
--
-- WHAT:
--   - `webhook_subscriptions` : 1 URL abonnée par tenant. `secret` en clair
--     (service_role only) car le dispatcher doit signer chaque POST — révélé UNE
--     fois à l'admin à la création (comme `tenant_secrets.bot_webhook_secret`).
--     `event_types text[]` = liste blanche d'events souscrits ('*' = tous les
--     events webhookables). `consecutive_failures`/`disabled_at` : auto-désactive
--     un endpoint mort.
--   - `webhook_deliveries` : journal par (subscription, event outbox).
--     `UNIQUE(subscription_id, outbox_event_id)` = idempotence si le cron se
--     chevauche/re-exécute (même garantie que web_push_deliveries). C'est notre
--     état de retry — jamais `bot_event_outbox.status`.
--   - RLS enabled, AUCUNE policy => service_role only (même pattern que
--     tenant_secrets / bot_event_outbox / web_push_deliveries).
--
-- CAVEATS:
--   - Idempotente : CREATE TABLE/INDEX IF NOT EXISTS.
--   - `created_by uuid` SANS FK (colonne d'audit ; la sub survit au départ du
--     staff créateur).
--   - Nouvelle table + FK => reload du cache PostgREST (NOTIFY en fin).

BEGIN;

CREATE TABLE IF NOT EXISTS public.webhook_subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  url                  text NOT NULL,
  secret               text NOT NULL,
  event_types          text[] NOT NULL DEFAULT '{}',
  description          text,
  enabled              boolean NOT NULL DEFAULT true,
  consecutive_failures integer NOT NULL DEFAULT 0,
  disabled_at          timestamptz,
  last_delivery_at     timestamptz,
  last_error           text,
  created_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_subscriptions_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_tenant
  ON public.webhook_subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_enabled
  ON public.webhook_subscriptions (tenant_id) WHERE enabled;

COMMENT ON TABLE public.webhook_subscriptions IS
  'Abonnements webhook sortants par tenant (URL + secret HMAC + filtre d''events). service_role only.';
COMMENT ON COLUMN public.webhook_subscriptions.secret IS
  'Secret de signature HMAC (clair, service_role only). Révélé une seule fois à la création côté admin.';
COMMENT ON COLUMN public.webhook_subscriptions.event_types IS
  'Liste blanche d''events souscrits (sous-ensemble de WEBHOOK_EVENT_TYPES). ''*'' = tous les events webhookables.';

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  subscription_id uuid NOT NULL,
  outbox_event_id text NOT NULL,
  event_name      text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts        integer NOT NULL DEFAULT 0,
  response_status integer,
  last_error      text,
  delivered_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_deliveries_subscription_fkey
    FOREIGN KEY (subscription_id) REFERENCES public.webhook_subscriptions(id) ON DELETE CASCADE,
  CONSTRAINT webhook_deliveries_uniq UNIQUE (subscription_id, outbox_event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_sub_created
  ON public.webhook_deliveries (subscription_id, created_at DESC);

COMMENT ON TABLE public.webhook_deliveries IS
  'Journal de livraison webhook par (subscription, event outbox). UNIQUE(subscription_id, outbox_event_id) = idempotence du dispatcher. service_role only.';

ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
-- Aucune policy intentionnellement : tout passe par supabaseAdmin (service_role
-- bypass RLS). Le lint Supabase `rls_enabled_no_policy` (INFO) sera positif —
-- attendu, même pattern que tenant_secrets / bot_event_outbox.

COMMIT;

-- PostgREST : reload du cache de schéma pour exposer les nouvelles tables + FK.
NOTIFY pgrst, 'reload schema';
