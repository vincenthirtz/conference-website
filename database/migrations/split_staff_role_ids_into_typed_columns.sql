-- Migration: split `tenant_discord_config.staff_role_ids` (text[]) en 4 colonnes typées
-- Date: 2026-05-21
--
-- WHY:
--   `tenant_discord_config.staff_role_ids text[]` (vide actuellement, 0 rows)
--   stocke un blob d'IDs Discord sans typage — le role-sync du bot ne sait
--   pas quel ID correspond à quel rôle staff (admin/manager/caster/owner).
--   On split en 4 colonnes typées pour que le bot puisse mapper proprement
--   chaque rôle staff Discord à une fonction côté site.
--
-- WHAT:
--   1. ADD COLUMN staff_role_admin_id   text  (nullable, opt-in par tenant)
--   2. ADD COLUMN staff_role_manager_id text
--   3. ADD COLUMN staff_role_caster_id  text
--   4. ADD COLUMN staff_role_owner_id   text
--   5. DROP COLUMN staff_role_ids (0 rows à migrer, drop net)
--
-- CAVEATS:
--   - Idempotente : guards IF NOT EXISTS / IF EXISTS.
--   - Aucun risque de perte de données : la table a 0 rows aujourd'hui (vérifié
--     2026-05-21). Si jamais des rows existent au moment de l'apply en prod,
--     `staff_role_ids` (text[]) sera DROP net — on a fait le choix produit
--     verrouillé le 2026-05-20 de typer cette config par rôle, pas de
--     conserver le blob array.
--   - Code applicatif : aucun handler ne lit `staff_role_ids` aujourd'hui
--     (vérifié grep). Le role-sync (à venir) consommera directement les 4
--     colonnes typées.
--
-- POSTGREST:
--   ADD COLUMN + DROP COLUMN -> reload schema cache (NOTIFY pgrst en fin).

BEGIN;

-- ===========================================================================
-- 1) ADD COLUMN — 4 rôles staff typés (tous nullables : opt-in par tenant)
-- ===========================================================================

ALTER TABLE public.tenant_discord_config
  ADD COLUMN IF NOT EXISTS staff_role_admin_id   text;

ALTER TABLE public.tenant_discord_config
  ADD COLUMN IF NOT EXISTS staff_role_manager_id text;

ALTER TABLE public.tenant_discord_config
  ADD COLUMN IF NOT EXISTS staff_role_caster_id  text;

ALTER TABLE public.tenant_discord_config
  ADD COLUMN IF NOT EXISTS staff_role_owner_id   text;

COMMENT ON COLUMN public.tenant_discord_config.staff_role_admin_id IS
  'Discord role snowflake mappé sur staff.role = admin pour ce tenant. NULL = pas de mapping (le role-sync ignore ce rôle).';
COMMENT ON COLUMN public.tenant_discord_config.staff_role_manager_id IS
  'Discord role snowflake mappé sur staff.role = manager pour ce tenant.';
COMMENT ON COLUMN public.tenant_discord_config.staff_role_caster_id IS
  'Discord role snowflake mappé sur staff.role = caster pour ce tenant.';
COMMENT ON COLUMN public.tenant_discord_config.staff_role_owner_id IS
  'Discord role snowflake mappé sur staff.role = owner pour ce tenant.';

-- ===========================================================================
-- 2) DROP COLUMN staff_role_ids (text[], remplacé par les 4 colonnes typées)
-- ===========================================================================

ALTER TABLE public.tenant_discord_config
  DROP COLUMN IF EXISTS staff_role_ids;

COMMIT;

-- ===========================================================================
-- 3) PostgREST schema cache reload
-- ===========================================================================

NOTIFY pgrst, 'reload schema';
