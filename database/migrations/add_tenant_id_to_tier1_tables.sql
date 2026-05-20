-- Migration: Phase 1a multi-tenant — `tenant_id` (nullable) sur les root tables Tier 1
-- Date: 2026-05-20
--
-- WHY:
--   Suite de la Phase 0 (`create_tenants_and_discord_guilds.sql`). On ajoute
--   maintenant la colonne `tenant_id uuid` (nullable d'abord) sur les root
--   tables métier/bot du Tier 1, et on crée la table de jointure
--   `tenant_staff` pour matérialiser quels staff bossent sur quel tenant.
--
--   Stratégie en 2 temps (verrouillée le 2026-05-20) :
--     - **Phase 1a (ce fichier)** : ADD COLUMN nullable + backfill +
--       INDEX. PAS de NOT NULL, PAS de FK encore. PAS de modif des UNIQUE
--       constraints. PAS de touche à `staff_logs` (Phase 1c, scoping).
--       Objectif : déployable sans casser un seul handler existant — la
--       colonne est invisible côté API tant qu'on ne la lit pas.
--     - **Phase 1d (PR séparée)** : SET NOT NULL + ADD FOREIGN KEY +
--       réécriture des UNIQUE pour inclure `tenant_id` (ex.
--       `UNIQUE(slug)` devient `UNIQUE(tenant_id, slug)`). Se fait
--       APRÈS que les handlers Phase 2 écrivent systématiquement
--       `tenant_id` à l'insert.
--
--   Root tables Tier 1 ciblées (9 tables) :
--     1. tournaments
--     2. teams
--     3. tournament_stages
--     4. scrims
--     5. cast_members
--     6. announcements
--     7. news
--     8. news_comments
--     9. discord_webhooks
--
--   PAS dans ce fichier :
--     - `staff` : reste GLOBAL (pas de tenant_id, décision produit). Un
--       humain staff peut bosser sur plusieurs tenants — matérialisé via
--       `tenant_staff` (cf. section 1 ci-dessous).
--     - `staff_logs` : sera scoped en Phase 1c (audit trail tenant-spécifique).
--     - Les tables enfants (matches, games, team_members, etc.) : héritent
--       du tenant via la FK parent → pas besoin de dupliquer (Phase 1b
--       décidera au cas par cas si on dénormalise pour les requêtes
--       cross-tenant).
--     - `bot_locks` / `bot_idempotency` / `admin_idempotency` : Phase 1c
--       (réécriture des PK/UNIQUE pour inclure tenant_id).
--
--   UUID `conference` (constante) : `ce69a726-773e-4d12-b5eb-d2503aa752b4`.
--   C'est la valeur de backfill pour TOUTES les rows existantes.
--
-- CAVEATS:
--   - Idempotente : ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
--     CREATE TABLE IF NOT EXISTS, backfill conditionné par
--     `WHERE tenant_id IS NULL`.
--   - PostgREST schema cache reload requis (nouvelles colonnes + nouvelle
--     table + nouvelle FK sur `tenant_staff`).
--   - PAS de SET NOT NULL ici : si on l'ajoute maintenant, n'importe quel
--     INSERT existant côté API (qui ne fournit pas encore `tenant_id`)
--     planterait → rollback nécessaire. On attend Phase 2 qui réécrit les
--     handlers pour systématiquement set `tenant_id`.
--   - La colonne `tenant_id` n'a PAS de FK vers `tenants(id)` ici. Raison :
--     ajouter la FK NOW forcerait une validation FULL TABLE sur chaque
--     table (verrou ACCESS EXCLUSIVE). C'est tolérable sur des petites
--     tables mais on préfère faire NOT NULL + FK en un seul shot en
--     Phase 1d, avec un `NOT VALID` + `VALIDATE CONSTRAINT` séparé pour
--     éviter le verrou prolongé.
--   - `tenant_staff.role` : volontairement `text` libre (pas de CHECK)
--     pour rester ouvert. Les valeurs canoniques attendues sont
--     `'owner' | 'admin' | 'caster' | 'observer'` mais on ne les
--     contraint pas tant que la sémantique n'est pas figée côté API.

BEGIN;

-- ===========================================================================
-- 1) Table jointure `tenant_staff` — quels staff bossent sur quels tenants
-- ===========================================================================
--
-- `staff` reste GLOBAL (1 row par humain). `tenant_staff` est la matrice
-- N-N qui dit "ce staff a tel rôle sur tel tenant". Un staff sans row dans
-- tenant_staff = staff "free" (pas affecté à un tenant, vue plate-forme).

CREATE TABLE IF NOT EXISTS public.tenant_staff (
  tenant_id  uuid NOT NULL,
  staff_id   uuid NOT NULL,
  role       text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, staff_id),
  CONSTRAINT tenant_staff_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT tenant_staff_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_staff_staff_id
  ON public.tenant_staff (staff_id);

COMMENT ON TABLE public.tenant_staff IS
  'Matrice N-N staff <-> tenant. Un staff peut bosser sur N tenants avec un rôle différent par tenant.';
COMMENT ON COLUMN public.tenant_staff.role IS
  'Rôle de ce staff sur ce tenant. Valeurs canoniques attendues : owner|admin|caster|observer.';

ALTER TABLE public.tenant_staff ENABLE ROW LEVEL SECURITY;
-- Aucune policy : table technique, accès via supabaseAdmin (service_role)
-- uniquement. Le check "ce staff a-t-il accès à ce tenant ?" est fait côté
-- API (withStaffRoute étendu en Phase 2).

-- Backfill : tous les staff existants sont implicitement membres du tenant
-- `conference` (la seule org qui existait avant Phase 0).
INSERT INTO public.tenant_staff (tenant_id, staff_id, role)
SELECT
  'ce69a726-773e-4d12-b5eb-d2503aa752b4'::uuid AS tenant_id,
  s.id AS staff_id,
  'admin' AS role
FROM public.staff s
ON CONFLICT (tenant_id, staff_id) DO NOTHING;

-- ===========================================================================
-- 2) ADD COLUMN tenant_id (nullable) sur les root tables Tier 1
-- ===========================================================================

ALTER TABLE public.tournaments        ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.teams              ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.tournament_stages  ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.scrims             ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.cast_members       ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.announcements      ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.news               ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.news_comments      ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.discord_webhooks   ADD COLUMN IF NOT EXISTS tenant_id uuid;

COMMENT ON COLUMN public.tournaments.tenant_id        IS 'Tenant propriétaire. Nullable transitoirement (Phase 1a) — sera NOT NULL + FK en Phase 1d.';
COMMENT ON COLUMN public.teams.tenant_id              IS 'Tenant propriétaire. Nullable transitoirement (Phase 1a) — sera NOT NULL + FK en Phase 1d.';
COMMENT ON COLUMN public.tournament_stages.tenant_id  IS 'Tenant propriétaire. Nullable transitoirement (Phase 1a) — sera NOT NULL + FK en Phase 1d.';
COMMENT ON COLUMN public.scrims.tenant_id             IS 'Tenant propriétaire. Nullable transitoirement (Phase 1a) — sera NOT NULL + FK en Phase 1d.';
COMMENT ON COLUMN public.cast_members.tenant_id       IS 'Tenant propriétaire. Si un humain caste pour 2 tenants → 2 rows. Nullable transitoirement (Phase 1a).';
COMMENT ON COLUMN public.announcements.tenant_id      IS 'Tenant propriétaire. Nullable transitoirement (Phase 1a) — sera NOT NULL + FK en Phase 1d.';
COMMENT ON COLUMN public.news.tenant_id               IS 'Tenant propriétaire. Nullable transitoirement (Phase 1a) — sera NOT NULL + FK en Phase 1d.';
COMMENT ON COLUMN public.news_comments.tenant_id      IS 'Tenant propriétaire (dénormalisé depuis news.tenant_id). Nullable transitoirement (Phase 1a).';
COMMENT ON COLUMN public.discord_webhooks.tenant_id   IS 'Tenant propriétaire. Nullable transitoirement (Phase 1a) — sera NOT NULL + FK en Phase 1d.';

-- ===========================================================================
-- 3) Backfill : toutes les rows existantes → tenant `conference`
-- ===========================================================================
--
-- Conditionné par `WHERE tenant_id IS NULL` pour idempotence : si la migration
-- est ré-appliquée après un partial-apply ou après que des handlers Phase 2
-- aient déjà inséré des rows avec un tenant_id non-conference, on ne les
-- écrase pas.

UPDATE public.tournaments        SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.teams              SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.tournament_stages  SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.scrims             SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.cast_members       SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.announcements      SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.news               SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.news_comments      SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.discord_webhooks   SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;

-- ===========================================================================
-- 4) Indexes sur `tenant_id` (chaque table)
-- ===========================================================================
--
-- Hot path attendu Phase 2 : `WHERE tenant_id = $1` sur quasi toutes les
-- requêtes (résolution via header `x-bot-guild-id` → tenant_id côté API).

CREATE INDEX IF NOT EXISTS idx_tournaments_tenant_id        ON public.tournaments        (tenant_id);
CREATE INDEX IF NOT EXISTS idx_teams_tenant_id              ON public.teams              (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tournament_stages_tenant_id  ON public.tournament_stages  (tenant_id);
CREATE INDEX IF NOT EXISTS idx_scrims_tenant_id             ON public.scrims             (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cast_members_tenant_id       ON public.cast_members       (tenant_id);
CREATE INDEX IF NOT EXISTS idx_announcements_tenant_id      ON public.announcements      (tenant_id);
CREATE INDEX IF NOT EXISTS idx_news_tenant_id               ON public.news               (tenant_id);
CREATE INDEX IF NOT EXISTS idx_news_comments_tenant_id      ON public.news_comments      (tenant_id);
CREATE INDEX IF NOT EXISTS idx_discord_webhooks_tenant_id   ON public.discord_webhooks   (tenant_id);

COMMIT;

-- ===========================================================================
-- 5) PostgREST schema cache reload
-- ===========================================================================
--
-- Nouvelles colonnes + nouvelle table `tenant_staff` + nouvelles FK. PostgREST
-- doit recharger son cache pour rendre tout ça visible (et permettre les
-- embeds `?select=*,tenant_staff(*)` si jamais on les utilise).

NOTIFY pgrst, 'reload schema';
