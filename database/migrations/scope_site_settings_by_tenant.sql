-- Migration : `site_settings` devient multi-tenant (lot A8 de
-- docs/PLAN-espace-admin.md).
--
-- La table avait `key` pour CLÉ PRIMAIRE — un seul jeu de réglages pour toute
-- l'installation — alors que le produit est multi-tenant partout ailleurs
-- (onboarding, `tenant_discord_config`, clés API, `x-tenant-id`). Y vivent
-- notamment :
--   * `team_roles` : les permissions d'équipe de TOUTES les équipes ;
--   * `roster_lock_deadline` : la date butoir de tous les tournois ;
--   * les seuils de rangs Overwatch, `bot_maintenance_mode`, etc.
--
-- Aujourd'hui il n'y a qu'un tenant : personne ne s'en aperçoit. Le jour où le
-- second arrive, il hérite silencieusement des réglages du premier, et modifier
-- les siens casse ceux de l'autre. C'est typiquement la migration qu'on ne veut
-- pas faire APRÈS avoir des utilisateurs des deux côtés — d'où maintenant.
--
-- Sans perte : chaque ligne existante est rattachée au tenant par défaut
-- (`DEFAULT_TENANT_ID`, cf. utils/tenant.ts).
-- Idempotente.

BEGIN;

-- 1. La colonne, rattachée au tenant existant ------------------------------
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE public.site_settings
   SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'
 WHERE tenant_id IS NULL;

ALTER TABLE public.site_settings
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.site_settings
  ALTER COLUMN tenant_id SET DEFAULT 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

-- 2. Clé primaire composite ------------------------------------------------
-- La PK sur `key` seul est exactement ce qui rendait les réglages globaux.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'site_settings_pkey'
       AND conrelid = 'public.site_settings'::regclass
  ) THEN
    ALTER TABLE public.site_settings DROP CONSTRAINT site_settings_pkey;
  END IF;
END $$;

ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_pkey PRIMARY KEY (tenant_id, key);

COMMIT;
