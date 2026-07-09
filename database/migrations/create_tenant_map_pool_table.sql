-- Migration: création de `tenant_map_pool` — catalogue de maps éditable au niveau tenant
-- Date: 2026-07-10
--
-- WHY:
--   Feature « Map pool global (tenant) ».
--   Aujourd'hui les maps sont peuplées PAR TOURNOI (`tournament_maps`) en copiant
--   le catalogue STATIQUE `config/games` (`getGame(slug).mapPool: GameMap[]`).
--   Ce catalogue n'est pas éditable : impossible pour un tenant de retirer une map,
--   d'ajouter une variante, ou de désactiver une map hors-rotation sans patcher le
--   code. On introduit un catalogue TENANT-LEVEL éditable (`tenant_map_pool`) qui
--   devient la source du flux par-tournoi (avec fallback sur `config/games` si le
--   pool tenant est vide pour le jeu concerné → aucune régression).
--
-- WHAT:
--   - Table `tenant_map_pool` (N rows par tenant, une row = une map d'un jeu).
--   - `game` : valeur GameSlug (overwatch | valorant | cs2 | rocket-league |
--     r6-siege | marvel-rivals | lol | dota2). PAS de CHECK enum DB : la validation
--     vit dans l'API (`isGameSlug`), on ajoute un jeu sans migration. Même posture
--     que `tenant_api_tokens.scopes`.
--   - `map_type` / `image_url` NULL : miroir de `GameMap { name, type, image }`.
--   - `enabled` : une map désactivée reste dans le pool (historique/UI) mais n'est
--     pas proposée au flux par-tournoi (filtre `enabled = true`).
--   - `order_index` NULL : ordre d'affichage optionnel (NULLS LAST côté requête).
--   - UNIQUE (tenant_id, game, lower(map_name)) via index unique sur expression :
--     dédup insensible à la casse (« Kings Row » == « kings row »). Permet à l'API
--     de renvoyer 409 sur doublon et à l'import-defaults d'être idempotent.
--
-- INDEX:
--   - `idx_tenant_map_pool_tenant_game` (tenant_id, game) : liste par jeu (GET ?game=).
--   - `idx_tenant_map_pool_order` (tenant_id, game, order_index) : tri d'affichage.
--   - index UNIQUE sur (tenant_id, game, lower(map_name)) : contrainte de dédup.
--
-- UPDATED_AT:
--   Trigger BEFORE UPDATE `trg_tenant_map_pool_updated_at` — le repo n'a PAS de
--   helper partagé `set_updated_at()`/`moddatetime` ; la convention établie est
--   une fonction PAR TABLE `update_<table>_updated_at()` (cf. free_players,
--   cast_members, adherents, partners…). On suit cette convention : `updated_at`
--   est maintenu par la DB, l'API n'a PAS à le positionner sur PATCH.
--
-- POSTGREST:
--   Nouvelle table + FK vers tenants -> RELOAD SCHEMA CACHE PostgREST après apply
--   (NOTIFY pgrst en fin de migration + bouton « Reload schema cache » du dashboard
--   si les embeds `tenant_map_pool(*)` ne remontent pas immédiatement).
--
-- CAVEATS:
--   - Idempotente : `CREATE TABLE/INDEX/TRIGGER IF NOT EXISTS` (+ DROP TRIGGER IF EXISTS).
--   - `ON DELETE CASCADE` sur la FK : supprimer un tenant emporte son map pool.
--   - Requiert `extensions.uuid_generate_v4` (déjà en prod, cf. tournament_maps).
--   - RLS enabled SANS policy => service_role only (accès via l'API admin manager).
--     Le lint Supabase `rls_enabled_no_policy` (INFO) sera positif — attendu,
--     même pattern que tenant_api_tokens / free_players.

BEGIN;

-- ===========================================================================
-- 1) Table
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.tenant_map_pool (
  id          uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  tenant_id   uuid NOT NULL,
  game        text NOT NULL,
  map_name    text NOT NULL,
  map_type    text,
  image_url   text,
  enabled     boolean NOT NULL DEFAULT true,
  order_index integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_map_pool_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.tenant_map_pool IS
  'Catalogue de maps éditable au niveau tenant (source du flux par-tournoi, fallback config/games si vide). Accès service_role uniquement (API admin manager).';
COMMENT ON COLUMN public.tenant_map_pool.game IS
  'GameSlug (overwatch|valorant|cs2|rocket-league|r6-siege|marvel-rivals|lol|dota2). Validation applicative (isGameSlug) — pas de CHECK enum DB volontairement.';
COMMENT ON COLUMN public.tenant_map_pool.map_type IS
  'Type de map (control, hybrid, escort, standard, active-duty…). NULL autorisé. Miroir de GameMap.type.';
COMMENT ON COLUMN public.tenant_map_pool.image_url IS
  'URL de l''image de la map. NULL autorisé. Miroir de GameMap.image.';
COMMENT ON COLUMN public.tenant_map_pool.enabled IS
  'Map active dans le pool. Une map désactivée reste listée mais n''est pas proposée au flux par-tournoi.';
COMMENT ON COLUMN public.tenant_map_pool.order_index IS
  'Ordre d''affichage optionnel (NULLS LAST côté requête).';

-- ===========================================================================
-- 2) Contrainte de dédup insensible à la casse : UNIQUE (tenant_id, game, lower(map_name))
-- ===========================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_map_pool_tenant_game_lower_name
  ON public.tenant_map_pool (tenant_id, game, lower(map_name));

-- ===========================================================================
-- 3) Index de requête
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_tenant_map_pool_tenant_game
  ON public.tenant_map_pool (tenant_id, game);

CREATE INDEX IF NOT EXISTS idx_tenant_map_pool_order
  ON public.tenant_map_pool (tenant_id, game, order_index);

-- ===========================================================================
-- 4) Trigger updated_at (convention repo : fonction par table, pas de helper partagé)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.update_tenant_map_pool_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_map_pool_updated_at ON public.tenant_map_pool;
CREATE TRIGGER trg_tenant_map_pool_updated_at
  BEFORE UPDATE ON public.tenant_map_pool
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tenant_map_pool_updated_at();

-- ===========================================================================
-- 5) RLS — service-role only (aucune policy)
-- ===========================================================================
--
-- Aucune policy : anon/auth bloqués. L'API admin manager accède via supabaseAdmin
-- (service_role bypass RLS). Cohérent avec la baseline des tables admin.
ALTER TABLE public.tenant_map_pool ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ===========================================================================
-- PostgREST schema cache reload (FK ajoutée vers tenants)
-- ===========================================================================
NOTIFY pgrst, 'reload schema';
