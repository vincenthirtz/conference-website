-- Pool de cartes de la JOURNÉE 2 — OW WOMEN's CUP 2026 (visuel « Map Pool 23/09 »).
--
-- Donnée one-shot, pas du schéma : la colonne `tournament_maps.round_number`
-- vient de la migration `tournament_maps_round_scoped_pool.sql`. J1 avait été
-- posée directement en production sans trace au dépôt ; ce fichier rétablit la
-- traçabilité pour J2.
--
-- Les 11 cartes sont DÉRIVÉES du pool par défaut du tournoi
-- (`round_number IS NULL`) plutôt que retapées : nom canonique, `map_type` et
-- `image_url` restent ainsi alignés sur le catalogue, et une carte absente du
-- pool par défaut ne serait pas insérée en silence avec un mauvais visuel.
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
  2 AS round_number,
  src.map_name,
  src.map_slug,
  src.map_type,
  src.image_url,
  true AS enabled,
  j2.order_index
FROM (VALUES
  ('Oasis',                1),  -- Contrôle
  ('Havana',               2),  -- Escorte (« La Havane »)
  ('Rialto',               3),
  ('Watchpoint: Gibraltar', 4), -- « Observatoire Gibraltar »
  ('Midtown',              5),  -- Hybride
  ('Hollywood',            6),
  ('King''s Row',          7),
  ('Aatlis',               8),  -- Point Chaud (flashpoint)
  ('New Junk City',        9),
  ('Runasapi',            10),  -- Poussée (push)
  ('Esperança',           11)
) AS j2(map_name, order_index)
JOIN public.tournament_maps src
  ON src.map_name = j2.map_name
 AND src.tournament_id = 'e8fa740c-d92b-49d8-a654-05a37d0eea3b'
 AND src.round_number IS NULL
ON CONFLICT (tenant_id, tournament_id, round_number, map_name) DO NOTHING;
