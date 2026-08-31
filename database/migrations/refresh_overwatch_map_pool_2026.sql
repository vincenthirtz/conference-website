-- Migration : aligne le pool de maps Overwatch sur l'état « Standard Play »
-- de la saison 3 / 2026 (30 maps), dans tournament_maps ET tenant_map_pool.
--
-- Trois écarts corrigés :
--   1. Hanaoka est une map CLASH, pas Control. Clash est sorti du compétitif
--      en saison 15 puis du jeu standard en 2026 -> la map quitte le pool.
--   2. « Throne of Aatlis » n'existe pas : c'est une confusion entre la map
--      Clash « Throne of Anubis » et la map Flashpoint « Aatlis » (Maroc,
--      2025-06-24). Renommage vers son vrai nom.
--   3. « Neon Junction » (Hybride, Tokyo, saison 3 2026) manquait.
--
-- Les vignettes pointent vers nos maquettes voxel locales
-- (public/img/maps/overwatch/*.svg), jamais vers un CDN de l'éditeur.
--
-- Idempotente : rejouable sans effet de bord.

BEGIN;

-- 1. Hanaoka (Clash) sort du pool ------------------------------------------
DELETE FROM public.tournament_maps WHERE map_name = 'Hanaoka';
DELETE FROM public.tenant_map_pool WHERE map_name = 'Hanaoka';

-- 2. « Throne of Aatlis » -> « Aatlis » -------------------------------------
UPDATE public.tournament_maps
   SET map_name = 'Aatlis',
       map_type = 'flashpoint',
       image_url = '/img/maps/overwatch/aatlis.svg'
 WHERE map_name = 'Throne of Aatlis';

UPDATE public.tenant_map_pool
   SET map_name = 'Aatlis',
       map_type = 'flashpoint',
       image_url = '/img/maps/overwatch/aatlis.svg'
 WHERE map_name = 'Throne of Aatlis';

-- 3. Neon Junction rejoint chaque pool qui n'a pas déjà la map --------------
INSERT INTO public.tournament_maps (tenant_id, tournament_id, map_name, map_type, image_url, enabled, order_index)
SELECT t.tenant_id,
       t.tournament_id,
       'Neon Junction',
       'hybrid',
       '/img/maps/overwatch/neon-junction.svg',
       true,
       COALESCE(MAX(t.order_index), 0) + 1
  FROM public.tournament_maps t
  JOIN public.tournaments g ON g.id = t.tournament_id AND g.game = 'overwatch'
 GROUP BY t.tenant_id, t.tournament_id
HAVING NOT EXISTS (
   SELECT 1 FROM public.tournament_maps x
    WHERE x.tournament_id = t.tournament_id AND x.map_name = 'Neon Junction'
 );

INSERT INTO public.tenant_map_pool (tenant_id, game, map_name, map_type, image_url, enabled, order_index)
SELECT p.tenant_id,
       'overwatch',
       'Neon Junction',
       'hybrid',
       '/img/maps/overwatch/neon-junction.svg',
       true,
       COALESCE(MAX(p.order_index), 0) + 1
  FROM public.tenant_map_pool p
 WHERE p.game = 'overwatch'
 GROUP BY p.tenant_id
HAVING NOT EXISTS (
   SELECT 1 FROM public.tenant_map_pool x
    WHERE x.tenant_id = p.tenant_id AND x.game = 'overwatch' AND x.map_name = 'Neon Junction'
 );

-- 4. Renumérotation : Control, Escort, Hybrid, Push, Flashpoint, puis A-Z ---
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY tournament_id
           ORDER BY CASE map_type
                      WHEN 'control' THEN 1
                      WHEN 'escort' THEN 2
                      WHEN 'hybrid' THEN 3
                      WHEN 'push' THEN 4
                      WHEN 'flashpoint' THEN 5
                      ELSE 6
                    END,
                    map_name
         ) AS pos
    FROM public.tournament_maps
)
UPDATE public.tournament_maps m
   SET order_index = ranked.pos
  FROM ranked
 WHERE ranked.id = m.id AND m.order_index IS DISTINCT FROM ranked.pos;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, game
           ORDER BY CASE map_type
                      WHEN 'control' THEN 1
                      WHEN 'escort' THEN 2
                      WHEN 'hybrid' THEN 3
                      WHEN 'push' THEN 4
                      WHEN 'flashpoint' THEN 5
                      ELSE 6
                    END,
                    map_name
         ) AS pos
    FROM public.tenant_map_pool
   WHERE game = 'overwatch'
)
UPDATE public.tenant_map_pool p
   SET order_index = ranked.pos
  FROM ranked
 WHERE ranked.id = p.id AND p.order_index IS DISTINCT FROM ranked.pos;

COMMIT;
