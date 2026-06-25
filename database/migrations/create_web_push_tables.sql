-- Migration: PWA /admin Web Push — subscriptions, prefs, deliveries
-- Date: 2026-05-21
--
-- WHY:
--   La PWA /admin (Phase 1 du chantier "admin mobile") ajoute du Web Push
--   pour notifier le staff sur leur device (iOS/Android/desktop) sans passer
--   par Discord DM. Le dispatcher Web Push tourne côté Next.js (route cron
--   ou worker) et :
--     1. LIT en read-only la table `bot_event_outbox` — c'est la même source
--        d'événements que le bot Discord (single source of truth).
--     2. NE MODIFIE PAS `bot_event_outbox.status` : ce flag appartient au bot
--        (pending → delivered quand le DM Discord est posté). Web Push a son
--        propre tracking dans `web_push_deliveries`.
--     3. Filtre les events selon les `notification_prefs` du user destinataire
--        (opt-out par event_type) et la membership tenant (un staff
--        cross-tenant reçoit les events des tenants où il est dans
--        `tenant_staff`).
--
-- WHAT:
--   3 tables :
--     - `push_subscriptions` : 1 row par (user, device). FK auth.users.
--       `tenant_id` est NULLABLE intentionnellement : un staff cross-tenant
--       n'a qu'UNE subscription par device, le dispatcher fanout aux events
--       de tous les tenants où ce user est membre (via tenant_staff). Si
--       tenant_id est NON NULL, c'est un opt-in volontaire pour scoper la
--       subscription à un seul tenant (cas marginal, future feature UI).
--     - `notification_prefs` : table dédiée (user_id, event_type, enabled).
--       Décision : auth.users n'est pas modifiable (Supabase ownership),
--       donc impossible d'ajouter une colonne JSONB dessus. Le format
--       "1 row par opt-out explicite, absent = enabled" minimise les writes
--       au signup (default opt-in) tout en restant queryable simplement.
--     - `web_push_deliveries` : tracking par (outbox_event, subscription).
--       UNIQUE empêche double-envoi. Service-role only (infra-grade).
--
-- CAVEATS:
--   - `bot_event_outbox.event_id` est de type TEXT (UNIQUE, pas PK). La FK
--     `web_push_deliveries.outbox_event_id` est donc TEXT. Vérifié en prod
--     via information_schema (cf. add_bot_event_outbox.sql ligne 20).
--   - RLS :
--       * `push_subscriptions` : user lit/écrit seulement ses propres rows.
--       * `notification_prefs` : idem (user-side prefs).
--       * `web_push_deliveries` : aucune policy → service_role only (infra).
--   - PostgREST schema cache reload requis après application : nouvelles FK
--     vers `auth.users`, `tenants`, `bot_event_outbox`. NOTIFY pgrst en fin
--     de migration ; en plus, conseiller un "Reload schema cache" manuel
--     dans Dashboard Supabase → Settings → API si les embeds échouent.
--   - Idempotente : IF NOT EXISTS partout, DROP POLICY IF EXISTS avant
--     CREATE POLICY, ré-appliquer la migration ne casse rien.
--
-- EVENT TYPES SUPPORTÉS (côté notification_prefs.event_type) :
--   - match.starting, match.finished, match.score_reported
--   - cast.assigned, cast.unassigned
--   - scrim.invitation, scrim.confirmed
--   - team.forfeit
--   - news.published
--   - staff.role.changed
--   - checkin.opened
--   - registration.new
--   - registration.blacklisted
--   - helloasso.payment.received
--   - captain.support.opened
-- Pas de CHECK constraint sur event_type : la liste évolue souvent et un
-- CHECK forcerait une migration à chaque nouveau type. La validation se
-- fait côté API (zod schema dans pages/api/admin/notifications/*).

BEGIN;

-- ===========================================================================
-- 1) Table `push_subscriptions` — endpoints Web Push par device
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions (user_id);

COMMENT ON TABLE public.push_subscriptions IS
  'Web Push subscriptions par (user, device). Endpoint est l''identifiant naturel chez le push service (Mozilla/Google/Apple).';
COMMENT ON COLUMN public.push_subscriptions.tenant_id IS
  'NULLABLE intentionnel : un staff cross-tenant a une subscription par device, pas par tenant. Le dispatcher fanout via tenant_staff. Si NON NULL = opt-in volontaire pour scoper à un seul tenant.';
COMMENT ON COLUMN public.push_subscriptions.endpoint IS
  'URL du push service (Mozilla/Google/Apple). UNIQUE — un même endpoint = un même device, on remplace si re-subscription.';
COMMENT ON COLUMN public.push_subscriptions.p256dh IS
  'Clé publique ECDH du client, base64-encoded. Requise pour chiffrer le payload.';
COMMENT ON COLUMN public.push_subscriptions.auth IS
  'Secret d''authentification du client, base64-encoded. Requis pour signer le payload.';
COMMENT ON COLUMN public.push_subscriptions.last_seen_at IS
  'Mis à jour à chaque appel /sw refresh ou login admin. Permet de purger les subscriptions inactives > 90j.';

-- RLS : user ne lit/écrit que ses propres subscriptions.
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS push_subscriptions_insert_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert_own
  ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS push_subscriptions_update_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_update_own
  ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ===========================================================================
-- 2) Table `notification_prefs` — opt-out par (user, event_type)
-- ===========================================================================
--
-- Modèle "absent row = enabled" (opt-out plutôt qu'opt-in) :
--   - Pas de write au signup → pas de N rows par user à provisionner.
--   - Le user désactive un type depuis /admin/notifications → INSERT
--     (user_id, event_type, enabled=false). Réactiver → DELETE (ou UPDATE).
--   - Le dispatcher Web Push query :
--       SELECT 1 FROM notification_prefs
--       WHERE user_id = ? AND event_type = ? AND enabled = false
--     → si match, skip ce user. Sinon, envoie.

CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_id
  ON public.notification_prefs (user_id);

COMMENT ON TABLE public.notification_prefs IS
  'Préférences notification par (user, event_type). Modèle opt-out : absent = enabled. Une row n''existe que si le user a explicitement désactivé (ou ré-activé) un type.';
COMMENT ON COLUMN public.notification_prefs.event_type IS
  'Ex: match.starting, cast.assigned, scrim.invitation, news.published, staff.role.changed, etc. Pas de CHECK : la liste évolue, validation côté API.';
COMMENT ON COLUMN public.notification_prefs.enabled IS
  'false = opt-out explicite. true peut exister si le user a opt-out puis re-opt-in (alternative: DELETE la row). Le dispatcher considère "row absente OR enabled=true" comme actif.';

-- RLS : user ne lit/écrit que ses propres prefs.
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_prefs_select_own ON public.notification_prefs;
CREATE POLICY notification_prefs_select_own
  ON public.notification_prefs
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notification_prefs_insert_own ON public.notification_prefs;
CREATE POLICY notification_prefs_insert_own
  ON public.notification_prefs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notification_prefs_update_own ON public.notification_prefs;
CREATE POLICY notification_prefs_update_own
  ON public.notification_prefs
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notification_prefs_delete_own ON public.notification_prefs;
CREATE POLICY notification_prefs_delete_own
  ON public.notification_prefs
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ===========================================================================
-- 3) Table `web_push_deliveries` — tracking livraison par (event, subscription)
-- ===========================================================================
--
-- Service-role only (aucune policy). Le dispatcher Web Push (route Next.js
-- ou cron) écrit ici via supabaseAdmin pour tracer chaque tentative
-- d'envoi. UNIQUE (outbox_event_id, subscription_id) empêche le double-
-- envoi si le dispatcher est relancé.
--
-- ⚠️ bot_event_outbox.event_id est TEXT (cf. add_bot_event_outbox.sql).
-- La FK est donc text→text, pas bigint→bigint.

CREATE TABLE IF NOT EXISTS public.web_push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_event_id text NOT NULL
    REFERENCES public.bot_event_outbox(event_id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL
    REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN ('pending', 'delivered', 'failed', 'expired')),
  delivered_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_push_deliveries_event_subscription_unique
    UNIQUE (outbox_event_id, subscription_id)
);

-- Query du dispatcher : "find non-delivered for this event" → (event_id, status).
CREATE INDEX IF NOT EXISTS idx_web_push_deliveries_event_status
  ON public.web_push_deliveries (outbox_event_id, status);

-- Debug subscription-side : "qu'est-ce qui a foiré pour cette subscription ?"
CREATE INDEX IF NOT EXISTS idx_web_push_deliveries_subscription_status
  ON public.web_push_deliveries (subscription_id, status);

COMMENT ON TABLE public.web_push_deliveries IS
  'Tracking de livraison Web Push par (outbox_event, subscription). Indépendant de bot_event_outbox.status (qui appartient au bot Discord).';
COMMENT ON COLUMN public.web_push_deliveries.outbox_event_id IS
  'FK vers bot_event_outbox.event_id (TEXT, UNIQUE). Lecture seule de la source d''événements.';
COMMENT ON COLUMN public.web_push_deliveries.status IS
  'pending = en file ; delivered = HTTP 201 du push service ; failed = HTTP 4xx/5xx récupérable ; expired = HTTP 410 Gone (la subscription est morte, à supprimer).';
COMMENT ON COLUMN public.web_push_deliveries.attempts IS
  'Nombre de tentatives HTTP. Le dispatcher retry avec backoff jusqu''à un seuil (config app), au-delà → status=failed définitif.';

-- RLS : service-role only (infra-grade, pas de policy).
ALTER TABLE public.web_push_deliveries ENABLE ROW LEVEL SECURITY;

-- Trigger updated_at — réutilise le pattern du repo.
CREATE OR REPLACE FUNCTION public.update_web_push_deliveries_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_web_push_deliveries_updated_at ON public.web_push_deliveries;
CREATE TRIGGER trg_web_push_deliveries_updated_at
  BEFORE UPDATE ON public.web_push_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_web_push_deliveries_updated_at();

COMMIT;

-- ===========================================================================
-- 4) PostgREST schema cache reload
-- ===========================================================================
--
-- Nouvelles tables + nouvelles FK (auth.users, tenants, bot_event_outbox,
-- push_subscriptions). PostgREST doit recharger son cache pour exposer les
-- embeds (?select=*,push_subscriptions(*) etc.). Si l'embed échoue avec
-- "could not find relationship", aller en plus dans Dashboard Supabase →
-- Settings → API → "Reload schema cache".

NOTIFY pgrst, 'reload schema';
