-- Migration: Phase 0 multi-tenant — création des tables `tenants` et `discord_guilds`
-- Date: 2026-05-20
--
-- WHY:
--   Décision produit verrouillée le 2026-05-20 : on rend l'API conference-website
--   et le bot Discord multi-tenant. Un "tenant" correspond à une organisation
--   cliente (ex. "Conférence", "Tournoi X", etc.) ; chaque tenant aura à terme
--   ses propres tournois, équipes, matches, configs Discord, etc.
--
--   Cette migration est la fondation. Elle :
--     1. Crée la table `tenants` (organisations) et la table de mapping
--        `discord_guilds` (1 tenant ↔ N guilds Discord, dont 1 "primary").
--     2. Seed le tenant historique "conference" avec un UUID FIXE codé en dur
--        dans la migration : `ce69a726-773e-4d12-b5eb-d2503aa752b4`. Cet UUID
--        deviendra `DEFAULT_TENANT_ID` côté API en Phase 2 (résolution
--        automatique des routes "sans tenant" → tenant conference).
--     3. Active RLS :
--          - `tenants` : lecture publique anon/auth (les pages publiques
--            doivent pouvoir résoudre un `slug` → tenant_id sans passer par
--            l'API).
--          - `discord_guilds` : pas de policy (service_role only). Le mapping
--            guild_id → tenant_id est une donnée technique consommée
--            uniquement par les routes /api/bot/v1/* (résolution du tenant
--            à partir du header `x-bot-guild-id` envoyé par le bot).
--
-- PHASE 1 (à venir, PR séparée) : ajout d'une colonne `tenant_id` sur les ~32
-- tables métier/bot listées dans l'audit (Tier 1+2+3 hors `user_discord_links`
-- et tables globales du Tier 4). Cf. memory/multi-tenant-bot-decisions.md.
--
-- CAVEATS:
--   - L'UUID du tenant `conference` est FIGÉ : ne JAMAIS le changer une fois
--     appliqué — il sera référencé en dur côté API/bot.
--   - Le `guild_id` de la guild Discord historique doit être complété APRÈS
--     application : voir la section "Seed discord_guilds" plus bas. Une row
--     placeholder est insérée commentée, à activer manuellement par
--     l'opérateur avec le vrai snowflake (cf. .env prod, variable
--     `DISCORD_GUILD_ID`).
--   - PostgREST schema cache reload requis après application (nouvelles FK +
--     nouvelles tables). `NOTIFY pgrst, 'reload schema'` envoyé en fin de
--     migration, mais on conseille en plus de cliquer "Reload schema cache"
--     dans la Dashboard Supabase (Settings → API).
--   - Idempotente : peut être ré-appliquée sans erreur (IF NOT EXISTS partout,
--     ON CONFLICT DO NOTHING sur les seeds).

BEGIN;

-- ===========================================================================
-- 1) Table `tenants` — organisations clientes
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  default_locale text NOT NULL DEFAULT 'fr',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_slug_format_chk
    CHECK (slug ~ '^[a-z0-9-]+$' AND char_length(slug) BETWEEN 2 AND 50)
);

-- Slug UNIQUE — c'est l'identifiant lisible côté URL / config bot.
CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_key
  ON public.tenants (slug);

COMMENT ON TABLE public.tenants IS
  'Organisations clientes multi-tenant. Chaque tenant a ses propres tournois, équipes, matches, etc.';
COMMENT ON COLUMN public.tenants.slug IS
  'Identifiant lisible (kebab-case, lowercase, 2-50 chars). Utilisé dans les URLs publiques et la config bot.';
COMMENT ON COLUMN public.tenants.default_locale IS
  'Locale par défaut pour les emails/DM Discord/UI publique de ce tenant.';

-- Trigger updated_at — réutilise la fonction générique `update_updated_at_column`
-- si elle existe (cas habituel dans ce repo), sinon en crée une dédiée.
CREATE OR REPLACE FUNCTION public.update_tenants_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tenants_updated_at();

-- ===========================================================================
-- 2) Table `discord_guilds` — mapping guild Discord ↔ tenant
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.discord_guilds (
  guild_id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discord_guilds_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_discord_guilds_tenant_id
  ON public.discord_guilds (tenant_id);

COMMENT ON TABLE public.discord_guilds IS
  'Mapping guild Discord (snowflake) → tenant. Un tenant peut avoir plusieurs guilds (ex. serveur principal + serveur de test), mais en général une seule "primary".';
COMMENT ON COLUMN public.discord_guilds.guild_id IS
  'Discord snowflake (string, peut dépasser 2^53, donc text).';
COMMENT ON COLUMN public.discord_guilds.is_primary IS
  'true si c''est la guild principale du tenant (utilisée pour les DM/notifs par défaut).';

-- ===========================================================================
-- 3) RLS — Row-Level Security
-- ===========================================================================

-- tenants : lecture publique anon/auth (résolution slug → tenant côté pages
-- publiques sans hop API). Pas de policy INSERT/UPDATE/DELETE → mutations
-- via supabaseAdmin uniquement (service_role bypass RLS).
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_select_public ON public.tenants;
CREATE POLICY tenants_select_public
  ON public.tenants
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- discord_guilds : aucune policy = aucun accès anon/auth (info technique
-- bot-only). Le service_role bypass RLS donc les routes /api/bot/v1/* y
-- accèdent via supabaseAdmin pour résoudre guild_id → tenant_id.
ALTER TABLE public.discord_guilds ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 4) Seed du tenant historique "conference" — UUID FIGÉ
-- ===========================================================================
--
-- UUID stable et codé en dur : `ce69a726-773e-4d12-b5eb-d2503aa752b4`.
-- C'est cette valeur qui sera référencée en dur côté API (constante
-- `DEFAULT_TENANT_ID` introduite en Phase 2). Ne JAMAIS modifier.

INSERT INTO public.tenants (id, slug, name, is_active, default_locale)
VALUES (
  'ce69a726-773e-4d12-b5eb-d2503aa752b4',
  'conference',
  'Conférence',
  true,
  'fr'
)
ON CONFLICT (slug) DO NOTHING;

-- ===========================================================================
-- 5) Seed `discord_guilds` — guild Discord conférence
-- ===========================================================================
--
-- Guild ID confirmé par l'opérateur le 2026-05-20 :
-- `1259186540001890474` (serveur Discord conférence, primary). Cette valeur
-- correspond à la variable `DISCORD_GUILD_ID` côté prod. C'est un snowflake
-- public (visible par n'importe quel membre du serveur), donc le commiter
-- dans la migration ne pose pas de problème de sécurité.

INSERT INTO public.discord_guilds (guild_id, tenant_id, is_primary)
VALUES (
  '1259186540001890474',
  'ce69a726-773e-4d12-b5eb-d2503aa752b4',
  true
)
ON CONFLICT (guild_id) DO NOTHING;

COMMIT;

-- ===========================================================================
-- 6) PostgREST schema cache reload
-- ===========================================================================
--
-- Nouvelles tables + nouvelle FK : PostgREST doit recharger son cache de
-- schéma pour les rendre visibles via l'API REST. Le NOTIFY déclenche un
-- reload immédiat côté PostgREST embarqué.
--
-- Si l'embed ne fonctionne pas (erreur "could not find relationship"), aller
-- aussi dans Dashboard Supabase → Settings → API → "Reload schema cache".

NOTIFY pgrst, 'reload schema';
