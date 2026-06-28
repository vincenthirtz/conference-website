-- Migration: création de la table `free_players` (joueuses "Recherche une équipe")
-- Date: 2026-06-28
--
-- WHY:
--   Le bot Discord pousse périodiquement l'ensemble des membres porteurs du
--   rôle "Recherche une équipe" (looking-for-team) de chaque serveur tenant.
--   Le site lit cette table pour présenter la liste des "free players" aux
--   capitaines d'équipe en quête de recrutement.
--
--   Le bot est la source de vérité : il fait le diff (ajout/retrait du rôle)
--   et upsert / supprime des rows ici. Le couple (tenant_id, discord_user_id)
--   est la clé fonctionnelle — un même Discord user ne peut figurer qu'une
--   seule fois par tenant.
--
--   auth_user_id est résolu via user_discord_links quand le compte Discord est
--   lié à un compte Supabase Auth. NULL = compte non lié (le joueur a le rôle
--   sur Discord mais ne s'est jamais connecté au site). On ne bloque pas
--   l'insertion sur l'absence de lien — la résolution est best-effort.
--
-- CAVEATS:
--   - Service-role only (RLS activée SANS policy). Écriture et lecture passent
--     exclusivement par les routes /api/bot/v1/* (push du bot) et les routes
--     API du site (read capitaines) via supabaseAdmin. Aucun accès PostgREST /
--     client direct — cohérent avec bot_player_actions, tenant_requests, etc.
--   - tenant_id NOT NULL + FK tenants(id) ON DELETE RESTRICT dès la création,
--     conforme à la convention Tier-1 (cf. enforce_tenant_id_not_null_and_fk).
--     Un opérateur qui supprime un tenant doit d'abord vider cette table.
--   - auth_user_id FK auth.users(id) ON DELETE SET NULL : si le compte Supabase
--     est supprimé, on conserve la row free_player (le rôle Discord existe
--     toujours) en repassant simplement le lien à NULL.
--   - UNIQUE (tenant_id, discord_user_id) : une seule entrée par joueur/tenant.
--     Le bot upsert sur ce couple. discord_user_id n'est PAS globalement unique
--     (un même Discord user peut être free player sur plusieurs serveurs).
--   - Idempotente (IF NOT EXISTS partout). Ré-appliquable sans erreur.
--   - PostgREST schema cache reload requis (nouvelle FK → tenants + auth.users) :
--     NOTIFY envoyé en fin de fichier, mais cliquer aussi "Reload schema cache"
--     dans Dashboard Supabase → Settings → API si un embed renvoie
--     "could not find relationship".

BEGIN;

-- ===========================================================================
-- 1) Table `free_players`
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.free_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scoping multi-tenant (convention Tier-1 : NOT NULL + FK tenants ON DELETE RESTRICT)
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,

  -- Identité Discord (clé fonctionnelle)
  discord_user_id text NOT NULL,                  -- snowflake Discord
  discord_username text,                          -- snapshot lisible au moment du push

  -- Lien vers le compte Supabase Auth, résolu via user_discord_links si lié
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Audit
  marked_at timestamptz NOT NULL DEFAULT now(),   -- date d'acquisition du rôle (côté bot)
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Une seule entrée par joueur et par tenant
  CONSTRAINT free_players_tenant_discord_unique UNIQUE (tenant_id, discord_user_id)
);

COMMENT ON TABLE public.free_players IS
  'Joueuses porteuses du rôle Discord "Recherche une équipe" par tenant. Alimentée par le bot, lue par les capitaines. Service-role only.';
COMMENT ON COLUMN public.free_players.discord_user_id IS
  'Snowflake Discord (string). Pas globalement unique : un même user peut être free player sur plusieurs tenants.';
COMMENT ON COLUMN public.free_players.discord_username IS
  'Username Discord au moment du push bot (snapshot, non synchronisé).';
COMMENT ON COLUMN public.free_players.auth_user_id IS
  'Compte Supabase Auth résolu via user_discord_links. NULL = compte Discord non lié au site.';
COMMENT ON COLUMN public.free_players.marked_at IS
  'Horodatage d''acquisition du rôle looking-for-team (vu côté bot).';

-- ===========================================================================
-- 2) Index
-- ===========================================================================

-- Hot path : "liste des free players de ce tenant" (lecture capitaines).
CREATE INDEX IF NOT EXISTS idx_free_players_tenant_id
  ON public.free_players(tenant_id);

-- ===========================================================================
-- 3) Trigger updated_at
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.update_free_players_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_free_players_updated_at ON public.free_players;
CREATE TRIGGER trg_free_players_updated_at
  BEFORE UPDATE ON public.free_players
  FOR EACH ROW
  EXECUTE FUNCTION public.update_free_players_updated_at();

-- ===========================================================================
-- 4) RLS — service-role only
-- ===========================================================================
--
-- Aucune policy : anon/auth bloqués. Le push du bot (/api/bot/v1/*) et la
-- lecture côté site accèdent via supabaseAdmin (service_role bypass RLS).

ALTER TABLE public.free_players ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ===========================================================================
-- 5) PostgREST schema cache reload
-- ===========================================================================

NOTIFY pgrst, 'reload schema';
