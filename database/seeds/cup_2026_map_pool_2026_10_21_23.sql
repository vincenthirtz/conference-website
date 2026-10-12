-- Pools de cartes DATÉS — OW WOMEN's CUP 2026 : mardi 21/10 et jeudi 23/10.
--
-- Donnée one-shot, pas du schéma. Pools par DATE DE JEU (`play_date`, jour
-- calendaire Europe/Paris) : colonne et priorité date > journée > défaut
-- venues de la migration `tournament_maps_date_scoped_pool.sql`. Jumeau de
-- `cup_2026_map_pool_j3.sql`, mais indexé sur la date et non la journée.
--
-- PRÉREQUIS : migration `add_overwatch_map_grimsvotn.sql` appliquée — elle
-- ajoute « Observatoire : Grímsvötn » au pool par défaut, dont ce fichier
-- DÉRIVE ses lignes. Le bloc de contrôle final fait échouer (et annuler) le
-- seed s'il manque une carte, au lieu de livrer un pool à 10 cartes.
--
-- Les cartes sont DÉRIVÉES du pool par défaut du tournoi (`round_number IS
-- NULL AND play_date IS NULL`) plutôt que retapées : nom canonique, `map_type`,
-- `map_slug` et `image_url` restent alignés sur le catalogue.
--
-- Correspondance visuel (FR) -> nom canonique du catalogue :
--   « Tour de Lijiang »          -> Lijiang Tower
--   « Observatoire : Grímsvötn » -> Observatoire : Grímsvötn (nouvelle map
--                                   Escorte 2026, PAS Watchpoint: Gibraltar)
--   les autres noms sont identiques.
--
-- L'ordre reprend celui des visuels, type par type :
--   Contrôle · Escorte · Hybride · Point Chaud · Poussée
--
-- Idempotent : `ON CONFLICT` sur l'index unique
-- (tenant, tournoi, journée, date, carte) NULLS NOT DISTINCT.

BEGIN;

INSERT INTO public.tournament_maps (
  tenant_id, tournament_id, round_number, play_date, map_name, map_slug,
  map_type, image_url, enabled, order_index
)
SELECT
  src.tenant_id,
  src.tournament_id,
  NULL AS round_number,
  d.play_date,
  src.map_name,
  src.map_slug,
  src.map_type,
  src.image_url,
  true AS enabled,
  d.order_index
FROM (VALUES
  -- Mardi 21/10/2026
  (DATE '2026-10-21', 'Busan',                     1),  -- Contrôle
  (DATE '2026-10-21', 'Dorado',                    2),  -- Escorte
  (DATE '2026-10-21', 'Route 66',                  3),
  (DATE '2026-10-21', 'Observatoire : Grímsvötn',  4),
  (DATE '2026-10-21', 'Blizzard World',            5),  -- Hybride
  (DATE '2026-10-21', 'Numbani',                   6),
  (DATE '2026-10-21', 'Midtown',                   7),
  (DATE '2026-10-21', 'Suravasa',                  8),  -- Point Chaud (flashpoint)
  (DATE '2026-10-21', 'New Junk City',             9),
  (DATE '2026-10-21', 'Runasapi',                 10),  -- Poussée (push)
  (DATE '2026-10-21', 'Esperança',                11),
  -- Jeudi 23/10/2026
  (DATE '2026-10-23', 'Lijiang Tower',             1),  -- Contrôle — « Tour de Lijiang »
  (DATE '2026-10-23', 'Observatoire : Grímsvötn',  2),  -- Escorte
  (DATE '2026-10-23', 'Circuit Royal',             3),
  (DATE '2026-10-23', 'Rialto',                    4),
  (DATE '2026-10-23', 'King''s Row',               5),  -- Hybride
  (DATE '2026-10-23', 'Neon Junction',             6),
  (DATE '2026-10-23', 'Hollywood',                 7),
  (DATE '2026-10-23', 'Suravasa',                  8),  -- Point Chaud (flashpoint)
  (DATE '2026-10-23', 'Aatlis',                    9),
  (DATE '2026-10-23', 'New Queen Street',         10),  -- Poussée (push)
  (DATE '2026-10-23', 'Colosseo',                 11)
) AS d(play_date, map_name, order_index)
JOIN public.tournament_maps src
  ON src.map_name = d.map_name
 AND src.tournament_id = 'e8fa740c-d92b-49d8-a654-05a37d0eea3b'
 AND src.round_number IS NULL
 AND src.play_date IS NULL
ON CONFLICT (tenant_id, tournament_id, round_number, play_date, map_name)
DO NOTHING;

-- Contrôle : 11 cartes par date, sinon on annule tout.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(to_char(play_date, 'DD/MM') || ' = ' || n || ' cartes', ', ')
    INTO missing
    FROM (
      SELECT d.play_date, count(m.id) AS n
        FROM (VALUES (DATE '2026-10-21'), (DATE '2026-10-23')) AS d(play_date)
        LEFT JOIN public.tournament_maps m
          ON m.play_date = d.play_date
         AND m.tournament_id = 'e8fa740c-d92b-49d8-a654-05a37d0eea3b'
       GROUP BY d.play_date
    ) c
   WHERE n <> 11;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Pool daté incomplet (attendu 11 cartes) : %. Migration add_overwatch_map_grimsvotn.sql appliquée ?', missing;
  END IF;
END $$;

COMMIT;
