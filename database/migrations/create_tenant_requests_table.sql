-- Migration: création de la table `tenant_requests` (state machine du flow self-service "demander le bot")
-- Date: 2026-05-21
--
-- WHY:
--   On ouvre un flow self-service où un user peut demander que le bot Discord
--   conference-website soit ajouté à son serveur, ce qui crée automatiquement
--   un tenant après vérification email + invitation du bot. Cette table sert
--   de state machine pour ce flow :
--
--     1. User submit form (Discord OAuth identifié + Cloudflare Turnstile)
--        → row créée, status='pending_email_verification'.
--     2. User clique le lien Brevo → status='pending_bot_invite'.
--     3. User invite le bot via OAuth URL → bot `guildCreate` →
--        /api/bot/v1/tenants/link-guild matche
--        requester_discord_user_id == owner_discord_id → auto-création tenant
--        (tenants, discord_guilds, tenant_secrets, staff, tenant_staff).
--     4. Email Brevo /onboard/secrets/[token] (single-use reveal page) →
--        status='completed'.
--
-- CAVEATS:
--   - Service-role only (RLS activée sans policy). Le flow est administré
--     par les routes /api/onboarding/* et /api/bot/v1/tenants/link-guild
--     via supabaseAdmin.
--   - Tokens single-use : email_verification_token + secrets_reveal_token
--     UNIQUE pour protéger contre une collision crypto random (probabilité
--     statistiquement nulle mais on cadenasse l'invariant côté DB).
--   - Unique partiel uq_tenant_requests_active_per_user : empêche un même
--     Discord user d'avoir 2 requests pendants simultanés (anti-spam DB-side).
--     L'API doit renvoyer 409 si tentative de doublon.
--   - Unique partiel uq_tenant_requests_active_slug : réserve le slug
--     pendant tout le flow pour éviter la course condition entre 2 users
--     qui choisiraient le même slug et finiraient leur flow simultanément.
--   - Pas de cap sur les requests 'completed' : un même user peut administrer
--     plusieurs tenants au fil du temps.
--   - Pas de FK sur requester_auth_user_id : un user peut soumettre sans être
--     sign-in Supabase Auth (Discord OAuth via le bot ID suffit). FK à
--     considérer plus tard si le flow se durcit.
--   - Idempotente (IF NOT EXISTS partout). Peut être ré-appliquée sans erreur.
--   - PostgREST schema cache reload requis (nouvelle FK → tenants) :
--     NOTIFY envoyé en fin de fichier, mais cliquer aussi "Reload schema cache"
--     dans Dashboard Supabase si l'API renvoie "could not find relationship".

BEGIN;

-- ===========================================================================
-- 1) Table `tenant_requests`
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.tenant_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identité du demandeur (depuis Discord OAuth)
  requester_discord_user_id text NOT NULL,         -- snowflake Discord
  requester_discord_display_name text,             -- pour UX admin/queue
  requester_email text NOT NULL,                   -- support + secrets reveal email
  requester_auth_user_id uuid,                     -- si signed-in via Supabase, sinon NULL

  -- Données du tenant à créer
  requested_slug text NOT NULL,                    -- validé `[a-z][a-z0-9-]{2,29}` côté API
  requested_name text NOT NULL,                    -- 1-200 chars
  description text,                                -- optionnel, 0-1000 chars

  -- État machine
  status text NOT NULL DEFAULT 'pending_email_verification'
    CHECK (status IN (
      'pending_email_verification',
      'pending_bot_invite',
      'completed',
      'rejected',
      'expired'
    )),
  rejection_reason text,                           -- si rejeté manuellement par staff

  -- Tokens
  email_verification_token text UNIQUE,            -- single-use, généré à la création
  email_verified_at timestamptz,
  secrets_reveal_token text UNIQUE,                -- single-use, généré quand status->completed
  secrets_reveal_token_expires_at timestamptz,
  secrets_revealed_at timestamptz,                 -- pour invalider après 1ère consultation

  -- Output
  created_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  created_guild_id text,                           -- snowflake Discord du serveur invitee

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text
);

COMMENT ON TABLE public.tenant_requests IS
  'State machine du flow self-service "demander le bot Discord". Crée un tenant auto après vérification email + invitation bot.';
COMMENT ON COLUMN public.tenant_requests.requester_discord_user_id IS
  'Snowflake Discord du demandeur (depuis Discord OAuth). Sert au match avec owner_discord_id lors du guildCreate.';
COMMENT ON COLUMN public.tenant_requests.requested_slug IS
  'Slug souhaité pour le futur tenant. Validé côté API au format ^[a-z][a-z0-9-]{2,29}$.';
COMMENT ON COLUMN public.tenant_requests.email_verification_token IS
  'Token single-use envoyé dans l''email Brevo. Consommé au clic → status passe à pending_bot_invite.';
COMMENT ON COLUMN public.tenant_requests.secrets_reveal_token IS
  'Token single-use pour la page /onboard/secrets/[token]. Consommé à la 1ère consultation (secrets_revealed_at).';

-- ===========================================================================
-- 2) Index pour lookups
-- ===========================================================================

CREATE INDEX IF NOT EXISTS idx_tenant_requests_discord_user
  ON public.tenant_requests(requester_discord_user_id);

CREATE INDEX IF NOT EXISTS idx_tenant_requests_status
  ON public.tenant_requests(status);

-- Covering index pour la FK created_tenant_id (queue admin "voir les requests
-- liées à un tenant existant"). Partial pour n'indexer que les rows liées.
CREATE INDEX IF NOT EXISTS idx_tenant_requests_created_tenant_id
  ON public.tenant_requests(created_tenant_id)
  WHERE created_tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_requests_email_verif_token
  ON public.tenant_requests(email_verification_token)
  WHERE status = 'pending_email_verification';

CREATE INDEX IF NOT EXISTS idx_tenant_requests_reveal_token
  ON public.tenant_requests(secrets_reveal_token)
  WHERE secrets_revealed_at IS NULL;

-- ===========================================================================
-- 3) Unique partiels — anti-spam + réservation de slug
-- ===========================================================================

-- Une seule request active (pending_*) par Discord user. Protection DB-side
-- contre le spam. L'API rejette en 409 avant d'arriver ici.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_requests_active_per_user
  ON public.tenant_requests(requester_discord_user_id)
  WHERE status IN ('pending_email_verification', 'pending_bot_invite');

-- Slug provisoirement unique sur les requests actives. Évite la course
-- condition entre 2 users qui demandent le même slug et terminent leur flow
-- en parallèle.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_requests_active_slug
  ON public.tenant_requests(lower(requested_slug))
  WHERE status IN ('pending_email_verification', 'pending_bot_invite');

-- ===========================================================================
-- 4) Trigger updated_at
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.update_tenant_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_requests_updated_at ON public.tenant_requests;
CREATE TRIGGER trg_tenant_requests_updated_at
  BEFORE UPDATE ON public.tenant_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tenant_requests_updated_at();

-- ===========================================================================
-- 5) RLS — service-role only
-- ===========================================================================
--
-- Aucune policy : anon/auth bloqués. Les routes /api/onboarding/* et
-- /api/bot/v1/tenants/link-guild accèdent via supabaseAdmin (service_role
-- bypass RLS).

ALTER TABLE public.tenant_requests ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ===========================================================================
-- 6) PostgREST schema cache reload
-- ===========================================================================

NOTIFY pgrst, 'reload schema';
