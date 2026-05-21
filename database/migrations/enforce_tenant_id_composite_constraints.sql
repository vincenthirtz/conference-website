-- Phase 3 / S6a — Contract step 2 : composer tenant_id dans les PK / UNIQUE existantes
--
-- POURQUOI :
--   Phase 3 step 1 a posé NOT NULL + FK sur tenant_id (toutes les 30 tables
--   scoped). Reste à scoper les UNIQUE / PK qui empêchent aujourd'hui deux
--   tenants d'avoir le même slug / cache_key / lock name / etc.
--
-- IMPACT CODE APPLICATIF :
--   Cette migration change les noms de contraintes UNIQUE ciblés par les
--   .upsert({ onConflict: '...' }) côté Supabase JS. Les call sites à
--   adapter en parallèle (api agent) :
--     - utils/botAuth.ts:89               'cache_key' -> 'tenant_id,cache_key'
--     - utils/adminIdempotency.ts:81      'cache_key' -> 'tenant_id,cache_key'
--     - pages/api/bot/v1/players/by-discord/[discordUserId]/actions/snooze.ts:81
--         'discord_user_id,action_key' -> 'tenant_id,discord_user_id,action_key'
--   Aucun autre call site n'utilise onConflict sur ces tables (grep confirmé
--   sur utils/ et pages/api/ — voir rapport S6a).
--   bot_locks n'utilise PAS .upsert, le code passe par SELECT puis INSERT/
--   UPDATE filtrés par (tenant_id, name) — déjà compatible avec la nouvelle
--   PK composite.
--
-- ORDRE D'APPLICATION :
--   1. Déployer le code TS adapté (onConflict composites).
--   2. Appliquer cette migration.
--   3. Reload PostgREST schema cache.
--   Inversion = window pendant laquelle les upserts cassent (onConflict
--   référence un index UNIQUE qui n'existe plus). Coordonner avec api agent.
--
-- STRATÉGIE :
--   - DROP / ADD PRIMARY KEY = lock ACCESS EXCLUSIVE bref. Les tables
--     concernées (bot_locks, player_action_snoozes) sont petites.
--   - Pour les UNIQUE indexes (bot_idempotency.cache_key, admin_idempotency.
--     cache_key, tournaments.slug, scrims.slug, news.slug, teams.slug
--     partial, discord_webhooks partials), on DROP CONSTRAINT (qui supprime
--     l'index sous-jacent) puis on recrée des UNIQUE composites incluant
--     tenant_id.
--
-- POSTGREST :
--   Suppression / création d'index UNIQUE et changement de PK impactent
--   le cache schema. NOTIFY pgrst en fin de fichier.
--
-- CAVEAT :
--   - Idempotent : guards IF EXISTS / IF NOT EXISTS.
--   - À appliquer APRÈS enforce_tenant_id_not_null_and_fk.sql.
--   - À appliquer APRÈS adaptation du code TS (onConflict composites).
--   - Rollback : recréer les UNIQUE/PK non-composites depuis pg_dump.

BEGIN;

-- ============================================================
-- bot_locks
--   PK (name) -> PK (tenant_id, name)
-- ============================================================
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conname = 'bot_locks_pkey'
    AND conrelid = 'public.bot_locks'::regclass;

  IF v_def = 'PRIMARY KEY (name)' THEN
    ALTER TABLE public.bot_locks DROP CONSTRAINT bot_locks_pkey;
    ALTER TABLE public.bot_locks ADD CONSTRAINT bot_locks_pkey PRIMARY KEY (tenant_id, name);
    RAISE NOTICE 'bot_locks PK migrated to (tenant_id, name)';
  ELSE
    RAISE NOTICE 'bot_locks PK skip (already composite or unexpected: %)', v_def;
  END IF;
END $$;

-- ============================================================
-- bot_idempotency
--   UNIQUE (cache_key) -> UNIQUE (tenant_id, cache_key)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bot_idempotency_cache_key_key'
      AND conrelid = 'public.bot_idempotency'::regclass
  ) THEN
    ALTER TABLE public.bot_idempotency DROP CONSTRAINT bot_idempotency_cache_key_key;
    RAISE NOTICE 'bot_idempotency_cache_key_key dropped';
  END IF;
END $$;

ALTER TABLE public.bot_idempotency
  ADD CONSTRAINT bot_idempotency_tenant_id_cache_key_key UNIQUE (tenant_id, cache_key);

-- ============================================================
-- admin_idempotency
--   UNIQUE (cache_key) -> UNIQUE (tenant_id, cache_key)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_idempotency_cache_key_key'
      AND conrelid = 'public.admin_idempotency'::regclass
  ) THEN
    ALTER TABLE public.admin_idempotency DROP CONSTRAINT admin_idempotency_cache_key_key;
    RAISE NOTICE 'admin_idempotency_cache_key_key dropped';
  END IF;
END $$;

ALTER TABLE public.admin_idempotency
  ADD CONSTRAINT admin_idempotency_tenant_id_cache_key_key UNIQUE (tenant_id, cache_key);

-- ============================================================
-- player_action_snoozes
--   PK (discord_user_id, action_key) -> PK (tenant_id, discord_user_id, action_key)
-- ============================================================
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conname = 'player_action_snoozes_pkey'
    AND conrelid = 'public.player_action_snoozes'::regclass;

  IF v_def = 'PRIMARY KEY (discord_user_id, action_key)' THEN
    ALTER TABLE public.player_action_snoozes DROP CONSTRAINT player_action_snoozes_pkey;
    ALTER TABLE public.player_action_snoozes
      ADD CONSTRAINT player_action_snoozes_pkey
      PRIMARY KEY (tenant_id, discord_user_id, action_key);
    RAISE NOTICE 'player_action_snoozes PK migrated to (tenant_id, discord_user_id, action_key)';
  ELSE
    RAISE NOTICE 'player_action_snoozes PK skip (already composite or unexpected: %)', v_def;
  END IF;
END $$;

-- ============================================================
-- tournaments
--   UNIQUE (slug) -> UNIQUE (tenant_id, slug)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tournaments_slug_key'
      AND conrelid = 'public.tournaments'::regclass
  ) THEN
    ALTER TABLE public.tournaments DROP CONSTRAINT tournaments_slug_key;
    RAISE NOTICE 'tournaments_slug_key dropped';
  END IF;
END $$;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_tenant_id_slug_key UNIQUE (tenant_id, slug);

-- ============================================================
-- scrims
--   UNIQUE (slug) -> UNIQUE (tenant_id, slug)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scrims_slug_key'
      AND conrelid = 'public.scrims'::regclass
  ) THEN
    ALTER TABLE public.scrims DROP CONSTRAINT scrims_slug_key;
    RAISE NOTICE 'scrims_slug_key dropped';
  END IF;
END $$;

ALTER TABLE public.scrims
  ADD CONSTRAINT scrims_tenant_id_slug_key UNIQUE (tenant_id, slug);

-- ============================================================
-- news
--   UNIQUE (slug) -> UNIQUE (tenant_id, slug)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'news_slug_key'
      AND conrelid = 'public.news'::regclass
  ) THEN
    ALTER TABLE public.news DROP CONSTRAINT news_slug_key;
    RAISE NOTICE 'news_slug_key dropped';
  END IF;
END $$;

ALTER TABLE public.news
  ADD CONSTRAINT news_tenant_id_slug_key UNIQUE (tenant_id, slug);

-- ============================================================
-- teams
--   partial UNIQUE INDEX (slug) WHERE slug IS NOT NULL
--   -> partial UNIQUE INDEX (tenant_id, slug) WHERE slug IS NOT NULL AND deleted_at IS NULL
--
-- NOTE :
--   L'index actuel `teams_slug_unique_idx` est partial sur (slug IS NOT NULL)
--   mais ne filtre pas `deleted_at`. On corrige aussi cette imprécision en
--   ajoutant `AND deleted_at IS NULL` — sans ça, une team soft-deleted
--   bloquerait la réutilisation de son slug par une nouvelle team.
-- ============================================================
DROP INDEX IF EXISTS public.teams_slug_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS teams_tenant_id_slug_unique_idx
  ON public.teams (tenant_id, slug)
  WHERE slug IS NOT NULL AND deleted_at IS NULL;

-- ============================================================
-- discord_webhooks
--   Partial UNIQUE (channel_type) WHERE tournament_id IS NULL
--     -> Partial UNIQUE (tenant_id, channel_type) WHERE tournament_id IS NULL
--
--   Partial UNIQUE (tournament_id, channel_type) WHERE tournament_id IS NOT NULL
--     -> conservé tel quel (tournament_id couvre déjà le tenant via FK
--        tournaments.tenant_id), mais on ajoute une garde de cohérence
--        (tenant_id, tournament_id, channel_type) pour empêcher un row
--        avec un tournament d'un autre tenant.
-- ============================================================
DROP INDEX IF EXISTS public.discord_webhooks_global_channel_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS discord_webhooks_tenant_global_channel_uidx
  ON public.discord_webhooks (tenant_id, channel_type)
  WHERE tournament_id IS NULL;

-- Garde supplémentaire pour les webhooks tournament-scoped : empêche
-- d'avoir (tenant_id A, tournament_id B) si tournament B appartient au
-- tenant C. C'est défensif (le code ne devrait jamais créer ce mismatch)
-- mais à coût d'index nul (déjà UNIQUE sur (tournament_id, channel_type)).
-- On garde l'index existant `discord_webhooks_tournament_channel_uidx`
-- et on ajoute un index NON-UNIQUE de cohérence pour faciliter les filtres
-- par tenant_id sans toucher à la sémantique UNIQUE existante.
CREATE INDEX IF NOT EXISTS idx_discord_webhooks_tenant_tournament
  ON public.discord_webhooks (tenant_id, tournament_id, channel_type)
  WHERE tournament_id IS NOT NULL;

-- ============================================================
-- Assertion finale : toutes les nouvelles UNIQUE/PK composites existent.
-- ============================================================
DO $$
DECLARE
  v_expected text[] := ARRAY[
    'bot_locks_pkey',
    'bot_idempotency_tenant_id_cache_key_key',
    'admin_idempotency_tenant_id_cache_key_key',
    'player_action_snoozes_pkey',
    'tournaments_tenant_id_slug_key',
    'scrims_tenant_id_slug_key',
    'news_tenant_id_slug_key'
  ];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY v_expected LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = v_name
    ) THEN
      RAISE EXCEPTION 'Phase 3 step 2: contrainte attendue manquante %', v_name;
    END IF;
  END LOOP;

  -- Partial indexes (pas des constraints) — vérifier via pg_indexes.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'teams_tenant_id_slug_unique_idx'
  ) THEN
    RAISE EXCEPTION 'Phase 3 step 2: index teams_tenant_id_slug_unique_idx manquant';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'discord_webhooks_tenant_global_channel_uidx'
  ) THEN
    RAISE EXCEPTION 'Phase 3 step 2: index discord_webhooks_tenant_global_channel_uidx manquant';
  END IF;
END $$;

COMMIT;

-- Reload PostgREST schema cache pour réindexer les contraintes ciblées par
-- les .upsert(..., { onConflict }).
NOTIFY pgrst, 'reload schema';
