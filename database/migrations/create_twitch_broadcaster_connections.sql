-- Migration: table twitch_broadcaster_connections (tokens OAuth broadcaster chiffrés)
-- Date: 2026-07-16
--
-- WHY:
--   Pour lancer des actions ÉCRIVANTES sur la chaîne Twitch depuis la régie
--   (predictions, puis modération / points de chaîne / message chat), il faut
--   un token OAuth du BROADCASTER avec les bons scopes — l'app token
--   (client_credentials) actuel est read-only. Ce token (access + refresh) doit
--   être persisté (on verrouille/résout une prediction plusieurs minutes après
--   le connect, et entre sessions) et rafraîchi côté serveur.
--
--   1 connexion par tenant (PK tenant_id) : le broadcaster principal du tenant.
--   V1 mono-chaîne — si multi-chaînes écrivantes un jour, passer à une PK
--   composite (tenant_id, broadcaster_id).
--
-- SÉCURITÉ:
--   - access_token / refresh_token stockés CHIFFRÉS (AES-256-GCM, utils/crypto.ts)
--     — jamais en clair. La clé vit dans l'env (TWITCH_TOKEN_ENC_KEY), pas en DB.
--   - RLS default-deny STRICT (aucune policy) : seul supabaseAdmin via les routes
--     staff (withStaffRoute) lit/écrit. Un token broadcaster ne doit JAMAIS
--     fuiter vers un client anon/authentifié. Aligné sur le pattern event_cues.
--   - PAS ajoutée à supabase_realtime : aucune raison d'émettre ces rows en
--     temps réel (et surtout pas des secrets).
--
-- CAVEATS:
--   - Idempotente (IF NOT EXISTS).
--   - PostgREST schema cache reload (nouvelle table + FK tenant).

BEGIN;

CREATE TABLE IF NOT EXISTS public.twitch_broadcaster_connections (
  tenant_id             uuid PRIMARY KEY
    REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Identité Twitch du broadcaster connecté (depuis GET /helix/users).
  broadcaster_id        text NOT NULL,
  broadcaster_login     text NOT NULL,

  -- Tokens OAuth CHIFFRÉS (AES-256-GCM). Format `v1.<iv>.<tag>.<ct>`.
  access_token_enc      text NOT NULL,
  refresh_token_enc     text NOT NULL,

  -- Scopes accordés (pour vérifier qu'une action dispose du scope requis).
  scope                 text[] NOT NULL DEFAULT '{}',

  -- Expiration de l'access token (refresh proactif avant échéance).
  expires_at            timestamptz NOT NULL,

  -- Staff qui a connecté la chaîne (audit). Pas de FK auth.users (cf. pattern
  -- event_cues.created_by_user_id).
  connected_by_user_id  uuid,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.twitch_broadcaster_connections IS
  'Token OAuth broadcaster Twitch (chiffré) par tenant, pour actions écrivantes régie (predictions/modération/points/chat). RLS deny strict, accès supabaseAdmin uniquement.';
COMMENT ON COLUMN public.twitch_broadcaster_connections.access_token_enc IS
  'Access token OAuth chiffré AES-256-GCM (utils/crypto.ts). Jamais en clair.';
COMMENT ON COLUMN public.twitch_broadcaster_connections.refresh_token_enc IS
  'Refresh token OAuth chiffré AES-256-GCM. Jamais en clair.';
COMMENT ON COLUMN public.twitch_broadcaster_connections.scope IS
  'Scopes OAuth accordés — permet de refuser une action dont le scope manque.';

-- Trigger updated_at (la row est UPSERT au (re)connect + UPDATE à chaque refresh).
CREATE OR REPLACE FUNCTION public.twitch_broadcaster_connections_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_twitch_broadcaster_conn_updated_at
  ON public.twitch_broadcaster_connections;
CREATE TRIGGER trg_twitch_broadcaster_conn_updated_at
  BEFORE UPDATE ON public.twitch_broadcaster_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.twitch_broadcaster_connections_set_updated_at();

-- RLS default-deny strict : aucune policy. Accès exclusivement via supabaseAdmin
-- dans les routes staff. Ces rows contiennent des secrets → jamais exposées.
ALTER TABLE public.twitch_broadcaster_connections ENABLE ROW LEVEL SECURITY;

COMMIT;

-- PostgREST schema cache reload (nouvelle table + FK tenant).
NOTIFY pgrst, 'reload schema';
