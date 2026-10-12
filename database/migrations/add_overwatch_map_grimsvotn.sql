-- Migration : nouvelle map Escorte Overwatch « Observatoire : Grímsvötn » (2026).
-- Date: 2026-10-12
--
-- WHY:
--   Les pools de cartes de la Women's Cup 2026 des 21/10 et 23/10 contiennent
--   « Observatoire : Grímsvötn », une NOUVELLE map Escorte sortie en 2026 —
--   ni un alias de « Watchpoint: Gibraltar », ni une autre map du pool. Elle
--   n'existait nulle part : ni dans le registre statique
--   (config/games/overwatch.ts), ni dans `tournament_maps`, ni dans
--   `tenant_map_pool`. Or les pools datés (seed
--   `cup_2026_map_pool_2026_10_21_23.sql`) sont DÉRIVÉS du pool par défaut du
--   tournoi : sans cette ligne, la map y serait omise en silence.
--
--   Nom gardé tel qu'il figure sur les visuels officiels de l'organisation.
--   Slug `observatoire-grimsvotn` = `mapSlug(nom)` (utils/maps/slug.ts), même
--   nom de fichier que la maquette voxel public/img/maps/overwatch/*.svg.
--
-- PORTÉE:
--   Seul le pool PAR DÉFAUT des tournois Overwatch est complété
--   (`round_number IS NULL AND play_date IS NULL`) : les pools de journée et de
--   date reproduisent un visuel précis et ne gagnent pas de carte en douce.
--   Idem pour la renumérotation, limitée au pool par défaut.
--
-- Idempotente : rejouable sans effet de bord.
-- Rollback : DELETE FROM public.tournament_maps WHERE map_name = 'Observatoire : Grímsvötn';
--            DELETE FROM public.tenant_map_pool WHERE map_name = 'Observatoire : Grímsvötn';

BEGIN;

-- 1. Pool par défaut de chaque tournoi Overwatch qui a déjà un pool ---------
INSERT INTO public.tournament_maps (
  tenant_id, tournament_id, map_name, map_slug, map_type, image_url,
  enabled, order_index
)
SELECT t.tenant_id,
       t.tournament_id,
       'Observatoire : Grímsvötn',
       'observatoire-grimsvotn',
       'escort',
       '/img/maps/overwatch/observatoire-grimsvotn.svg',
       true,
       COALESCE(MAX(t.order_index), 0) + 1
  FROM public.tournament_maps t
  JOIN public.tournaments g ON g.id = t.tournament_id AND g.game = 'overwatch'
 WHERE t.round_number IS NULL
   AND t.play_date IS NULL
 GROUP BY t.tenant_id, t.tournament_id
HAVING NOT EXISTS (
   SELECT 1 FROM public.tournament_maps x
    WHERE x.tenant_id = t.tenant_id
      AND x.tournament_id = t.tournament_id
      AND x.round_number IS NULL
      AND x.play_date IS NULL
      AND x.map_name = 'Observatoire : Grímsvötn'
 )
ON CONFLICT DO NOTHING;

-- 2. Catalogue éditable du tenant -------------------------------------------
INSERT INTO public.tenant_map_pool (
  tenant_id, game, map_name, map_type, image_url, enabled, order_index
)
SELECT p.tenant_id,
       'overwatch',
       'Observatoire : Grímsvötn',
       'escort',
       '/img/maps/overwatch/observatoire-grimsvotn.svg',
       true,
       COALESCE(MAX(p.order_index), 0) + 1
  FROM public.tenant_map_pool p
 WHERE p.game = 'overwatch'
 GROUP BY p.tenant_id
HAVING NOT EXISTS (
   SELECT 1 FROM public.tenant_map_pool x
    WHERE x.tenant_id = p.tenant_id
      AND x.game = 'overwatch'
      AND lower(x.map_name) = lower('Observatoire : Grímsvötn')
 )
ON CONFLICT DO NOTHING;

-- 3. Renumérotation : Control, Escort, Hybrid, Push, Flashpoint, puis A-Z ---
--    (même règle que refresh_overwatch_map_pool_2026.sql, pool par défaut seul)
WITH ranked AS (
  SELECT m.id,
         ROW_NUMBER() OVER (
           PARTITION BY m.tenant_id, m.tournament_id
           ORDER BY CASE m.map_type
                      WHEN 'control' THEN 1
                      WHEN 'escort' THEN 2
                      WHEN 'hybrid' THEN 3
                      WHEN 'push' THEN 4
                      WHEN 'flashpoint' THEN 5
                      ELSE 6
                    END,
                    m.map_name
         ) AS pos
    FROM public.tournament_maps m
    JOIN public.tournaments g ON g.id = m.tournament_id AND g.game = 'overwatch'
   WHERE m.round_number IS NULL
     AND m.play_date IS NULL
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
