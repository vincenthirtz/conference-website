-- Pool de cartes de la JOURNÉE 3 — OW WOMEN's CUP 2026 (visuel « Map Pool 25/09 »).
--
-- Donnée one-shot, pas du schéma : la colonne `tournament_maps.round_number`
-- vient de la migration `tournament_maps_round_scoped_pool.sql`. Même forme que
-- `cup_2026_map_pool_j2.sql`, dont ce fichier est le jumeau pour J3.
--
-- Les 11 cartes sont DÉRIVÉES du pool par défaut du tournoi
-- (`round_number IS NULL`) plutôt que retapées : nom canonique, `map_type` et
-- `image_url` restent ainsi alignés sur le catalogue, et une carte absente du
-- pool par défaut ne serait pas insérée en silence avec un mauvais visuel.
--
-- Le visuel orthographie « Aatilis » et « Paraïso » ; les noms canoniques du
-- catalogue sont `Aatlis` et `Paraíso` — c'est bien la même carte, et c'est la
-- raison pour laquelle on joint sur le pool par défaut au lieu de retaper.
--
-- L'ordre reprend celui du visuel, colonne par colonne :
--   Contrôle · Escorte · Hybride · Point Chaud · Poussée
--
-- Idempotent : `ON CONFLICT` sur l'index unique (tenant, tournoi, journée, carte).

INSERT INTO public.tournament_maps (
  tenant_id, tournament_id, round_number, map_name, map_slug,
  map_type, image_url, enabled, order_index
)
SELECT
  src.tenant_id,
  src.tournament_id,
  3 AS round_number,
  src.map_name,
  src.map_slug,
  src.map_type,
  src.image_url,
  true AS enabled,
  j3.order_index
FROM (VALUES
  ('Ilios',             1),  -- Contrôle
  ('Dorado',            2),  -- Escorte
  ('Circuit Royal',     3),
  ('Route 66',          4),
  ('Eichenwalde',       5),  -- Hybride
  ('Numbani',           6),
  ('Paraíso',           7),  -- « Paraïso » sur le visuel
  ('Suravasa',          8),  -- Point Chaud (flashpoint)
  ('Aatlis',            9),  -- « Aatilis » sur le visuel
  ('Colosseo',         10),  -- Poussée (push)
  ('New Queen Street', 11)
) AS j3(map_name, order_index)
JOIN public.tournament_maps src
  ON src.map_name = j3.map_name
 AND src.tournament_id = 'e8fa740c-d92b-49d8-a654-05a37d0eea3b'
 AND src.round_number IS NULL
ON CONFLICT (tenant_id, tournament_id, round_number, map_name) DO NOTHING;
