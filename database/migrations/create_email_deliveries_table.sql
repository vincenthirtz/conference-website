-- Migration: create `email_deliveries` — ledger de dedup d'envoi email
-- Date: 2026-06-28
--
-- WHY:
--   On ajoute un canal email generique aux notifications staff (cf.
--   add_channel_to_notification_prefs.sql). Comme pour le Web Push, le
--   dispatcher email LIT bot_event_outbox (single source of truth) et a besoin
--   de SON propre ledger de livraison, independant de bot_event_outbox.status
--   (qui appartient au bot Discord) et de web_push_deliveries (canal push).
--
--   La garantie "pas de double email" repose sur UNIQUE (outbox_event_id,
--   user_id) : si le dispatcher est relance (cron retry, restart Next.js au
--   mauvais moment), un INSERT en doublon echoue -> on n'envoie pas deux fois
--   le meme event au meme user.
--
-- WHAT:
--   Table `email_deliveries`, miroir simplifie de web_push_deliveries :
--     - granularite (outbox_event, user) et non (outbox_event, subscription),
--       car l'email cible un user, pas un device.
--     - status binaire 'sent'|'failed' (pas de retry tracking detaille ici ;
--       l'email est fire-and-forget cote provider, le ledger trace juste le
--       resultat pour la dedup).
--   Service-role only (aucune policy), infra-grade comme web_push_deliveries.
--
-- CAVEATS:
--   - bot_event_outbox.event_id est de type TEXT (UNIQUE, pas PK) — verifie en
--     prod via information_schema. outbox_event_id est donc TEXT pour matcher.
--     NB: on NE met PAS de FK vers bot_event_outbox ici (contrairement a
--     web_push_deliveries) : l'event peut etre purge cote outbox alors que le
--     ledger email doit survivre pour garder la garantie de dedup. C'est un
--     choix delibere — le ledger est la source de verite "deja envoye".
--   - tenant_id REFERENCES tenants(id) ON DELETE RESTRICT : on refuse de
--     supprimer un tenant tant qu'il reste des traces d'envoi (audit).
--   - user_id REFERENCES auth.users(id) ON DELETE CASCADE : si le user part,
--     ses traces d'envoi partent avec lui (RGPD-friendly).
--   - PostgREST schema cache reload REQUIS apres application : nouvelle table +
--     nouvelles FK (tenants, auth.users). NOTIFY pgrst en fin de migration ;
--     si les embeds echouent, "Reload schema cache" manuel dans Dashboard
--     Supabase -> Settings -> API.
--   - Idempotente : IF NOT EXISTS partout, re-application sans effet de bord.
--   - RLS : aucune policy -> service_role uniquement (le dispatcher ecrit via
--     supabaseAdmin). Aucun acces anon/authenticated.

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  outbox_event_id text NOT NULL,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_deliveries_event_user_unique
    UNIQUE (outbox_event_id, user_id)
);

-- Index FK / hot-path.
CREATE INDEX IF NOT EXISTS idx_email_deliveries_user_id
  ON public.email_deliveries (user_id);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_tenant_id
  ON public.email_deliveries (tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_created_at
  ON public.email_deliveries (created_at);

COMMENT ON TABLE public.email_deliveries IS
  'Ledger de dedup d''envoi email par (outbox_event, user). UNIQUE empeche le double-envoi si le dispatcher est relance. Service-role only (infra-grade). Independant de bot_event_outbox.status et de web_push_deliveries.';
COMMENT ON COLUMN public.email_deliveries.outbox_event_id IS
  'Reference logique vers bot_event_outbox.event_id (TEXT, UNIQUE). Pas de FK : le ledger doit survivre a la purge de l''outbox pour garder la garantie de dedup.';
COMMENT ON COLUMN public.email_deliveries.status IS
  'sent = email accepte par le provider ; failed = echec recupere (4xx/5xx provider). Trace le resultat pour la dedup, pas un retry detaille.';

-- RLS : service-role only (aucune policy), comme web_push_deliveries.
ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ===========================================================================
-- PostgREST schema cache reload
-- ===========================================================================
-- Nouvelle table + nouvelles FK (tenants, auth.users). PostgREST doit
-- recharger son cache pour exposer la table et ses relations. Si l'acces
-- echoue, "Reload schema cache" manuel dans Dashboard Supabase -> Settings -> API.
NOTIFY pgrst, 'reload schema';
