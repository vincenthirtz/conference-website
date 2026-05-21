-- Migration: ajout `tenant_id` sur `twitch_channels` (multi-tenant)
-- Date: 2026-05-21
--
-- WHY:
--   `twitch_channels` (chaînes Twitch partenaires affichées sur la home + relayées
--   par le bot Discord en notifs "live") n'avait pas de `tenant_id` jusqu'ici.
--   Conséquence : depuis que le bot Discord est multi-tenant, *tous* les guilds
--   linkés reçoivent les notifs de live pour les 12 channels conférence — fuite
--   cross-tenant manifeste.
--
--   Cette migration fait passer la table en tenant-scoped (backfill conference)
--   et remplace l'UNIQUE global sur `channel` par une UNIQUE composite
--   `(tenant_id, channel)` — un même channel Twitch peut être référencé par 2
--   tenants distincts (cas "Ninja" partagé par 2 orgs), mais pas en double sur
--   le même tenant.
--
-- WHAT:
--   1. ADD COLUMN tenant_id uuid (nullable transitoire le temps du backfill).
--   2. Backfill = conference (UUID figé ce69a726-...).
--   3. SET NOT NULL + FK -> tenants(id) ON DELETE RESTRICT.
--   4. INDEX (tenant_id) pour les hot-path filtres handlers/bot.
--   5. DROP UNIQUE (channel) -> ADD UNIQUE (tenant_id, channel).
--
-- RLS:
--   La policy `twitch_channels_select_policy` existe déjà (lecture publique
--   anon/auth, USING true). Elle reste telle quelle dans cette migration —
--   ouvrir la lecture cross-tenant à anon n'est pas un risque sécu sur cette
--   table (les channels Twitch sont publics par nature). Le tenant scoping est
--   appliqué côté handler API (`/api/lives`, etc.) via le filtre
--   `WHERE tenant_id = resolveTenantId(req)`. À durcir en Phase ultérieure si
--   on expose un endpoint anon cross-tenant.
--
-- POSTGREST:
--   Nouvelle colonne + nouvelle FK + nouvelles UNIQUE/INDEX -> reload schema cache
--   requis (NOTIFY pgrst en fin de fichier).
--
-- CAVEATS:
--   - Idempotente : guards IF NOT EXISTS / IF EXISTS / DO blocks conditionnels.
--   - Code applicatif : tout INSERT sur `twitch_channels` doit désormais fournir
--     `tenant_id` (sinon NOT NULL violation). Le handler admin actuel doit être
--     ajusté en parallèle (api agent) — coordonner le déploiement.
--   - `.upsert({ onConflict: 'channel' })` sur cette table casserait : la
--     contrainte `twitch_channels_channel_key` est remplacée par
--     `twitch_channels_tenant_id_channel_key`. Vérifier les call sites
--     (`grep -rn "twitch_channels" pages/ utils/`).

BEGIN;

-- ===========================================================================
-- 1) ADD COLUMN tenant_id (nullable transitoire)
-- ===========================================================================

ALTER TABLE public.twitch_channels
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

COMMENT ON COLUMN public.twitch_channels.tenant_id IS
  'Tenant propriétaire. Backfilled au tenant conference (ce69a726-773e-4d12-b5eb-d2503aa752b4) pour les 12 rows historiques.';

-- ===========================================================================
-- 2) Backfill = tenant conference
-- ===========================================================================

UPDATE public.twitch_channels
SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'::uuid
WHERE tenant_id IS NULL;

-- ===========================================================================
-- 3) SET NOT NULL + FK
-- ===========================================================================

ALTER TABLE public.twitch_channels
  ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'twitch_channels_tenant_id_fkey'
      AND conrelid = 'public.twitch_channels'::regclass
  ) THEN
    ALTER TABLE public.twitch_channels
      ADD CONSTRAINT twitch_channels_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
    RAISE NOTICE 'FK twitch_channels_tenant_id_fkey added';
  ELSE
    RAISE NOTICE 'FK twitch_channels_tenant_id_fkey already present, skip';
  END IF;
END $$;

-- ===========================================================================
-- 4) INDEX sur tenant_id (filtre hot-path)
-- ===========================================================================

CREATE INDEX IF NOT EXISTS idx_twitch_channels_tenant_id
  ON public.twitch_channels (tenant_id);

-- ===========================================================================
-- 5) UNIQUE (channel) -> UNIQUE (tenant_id, channel)
-- ===========================================================================
--
-- Un même `channel` Twitch peut être listé pour 2 tenants distincts. La
-- contrainte globale actuelle (`twitch_channels_channel_key`) empêche cela —
-- on la remplace par une contrainte composite.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'twitch_channels_channel_key'
      AND conrelid = 'public.twitch_channels'::regclass
  ) THEN
    ALTER TABLE public.twitch_channels DROP CONSTRAINT twitch_channels_channel_key;
    RAISE NOTICE 'twitch_channels_channel_key (UNIQUE global) dropped';
  ELSE
    RAISE NOTICE 'twitch_channels_channel_key not found (already dropped), skip';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'twitch_channels_tenant_id_channel_key'
      AND conrelid = 'public.twitch_channels'::regclass
  ) THEN
    ALTER TABLE public.twitch_channels
      ADD CONSTRAINT twitch_channels_tenant_id_channel_key
      UNIQUE (tenant_id, channel);
    RAISE NOTICE 'twitch_channels_tenant_id_channel_key (UNIQUE composite) added';
  ELSE
    RAISE NOTICE 'twitch_channels_tenant_id_channel_key already present, skip';
  END IF;
END $$;

COMMIT;

-- ===========================================================================
-- 6) PostgREST schema cache reload
-- ===========================================================================

NOTIFY pgrst, 'reload schema';
