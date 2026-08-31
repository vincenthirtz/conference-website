-- Seed data: pool de maps Overwatch « Standard Play » (compétitif 5v5)
--
-- État de référence : saison 3 / 2026 (30 maps). Aligné sur le registre
-- config/games/overwatch.ts — les deux DOIVENT rester identiques.
--
-- Les vignettes sont NOS maquettes voxel (public/img/maps/overwatch/*.svg),
-- pas les captures de l'éditeur : voir l'en-tête de config/games/overwatch.ts.
--
-- Clash (Hanaoka, Throne of Anubis) est hors pool : retiré du compétitif en
-- saison 15, puis du jeu standard en 2026.
--
-- Remplacer 'e8fa740c-d92b-49d8-a654-05a37d0eea3b' par l'UUID du tournoi visé.

INSERT INTO public.tournament_maps (
  tournament_id,
  map_name,
  map_type,
  image_url,
  enabled,
  order_index
)
VALUES
  -- Control (7)
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Antarctic Peninsula', 'control', '/img/maps/overwatch/antarctic-peninsula.svg', true, 1),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Busan', 'control', '/img/maps/overwatch/busan.svg', true, 2),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Ilios', 'control', '/img/maps/overwatch/ilios.svg', true, 3),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Lijiang Tower', 'control', '/img/maps/overwatch/lijiang-tower.svg', true, 4),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Nepal', 'control', '/img/maps/overwatch/nepal.svg', true, 5),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Oasis', 'control', '/img/maps/overwatch/oasis.svg', true, 6),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Samoa', 'control', '/img/maps/overwatch/samoa.svg', true, 7),

  -- Escort (8)
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Circuit Royal', 'escort', '/img/maps/overwatch/circuit-royal.svg', true, 8),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Dorado', 'escort', '/img/maps/overwatch/dorado.svg', true, 9),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Havana', 'escort', '/img/maps/overwatch/havana.svg', true, 10),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Junkertown', 'escort', '/img/maps/overwatch/junkertown.svg', true, 11),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Rialto', 'escort', '/img/maps/overwatch/rialto.svg', true, 12),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Route 66', 'escort', '/img/maps/overwatch/route-66.svg', true, 13),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Shambali Monastery', 'escort', '/img/maps/overwatch/shambali-monastery.svg', true, 14),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Watchpoint: Gibraltar', 'escort', '/img/maps/overwatch/watchpoint-gibraltar.svg', true, 15),

  -- Hybrid (8)
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Blizzard World', 'hybrid', '/img/maps/overwatch/blizzard-world.svg', true, 16),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Eichenwalde', 'hybrid', '/img/maps/overwatch/eichenwalde.svg', true, 17),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Hollywood', 'hybrid', '/img/maps/overwatch/hollywood.svg', true, 18),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'King''s Row', 'hybrid', '/img/maps/overwatch/kings-row.svg', true, 19),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Midtown', 'hybrid', '/img/maps/overwatch/midtown.svg', true, 20),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Neon Junction', 'hybrid', '/img/maps/overwatch/neon-junction.svg', true, 21),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Numbani', 'hybrid', '/img/maps/overwatch/numbani.svg', true, 22),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Paraíso', 'hybrid', '/img/maps/overwatch/paraiso.svg', true, 23),

  -- Push (4)
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Colosseo', 'push', '/img/maps/overwatch/colosseo.svg', true, 24),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Esperança', 'push', '/img/maps/overwatch/esperanca.svg', true, 25),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'New Queen Street', 'push', '/img/maps/overwatch/new-queen-street.svg', true, 26),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Runasapi', 'push', '/img/maps/overwatch/runasapi.svg', true, 27),

  -- Flashpoint (3)
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Aatlis', 'flashpoint', '/img/maps/overwatch/aatlis.svg', true, 28),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'New Junk City', 'flashpoint', '/img/maps/overwatch/new-junk-city.svg', true, 29),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Suravasa', 'flashpoint', '/img/maps/overwatch/suravasa.svg', true, 30)
ON CONFLICT DO NOTHING;
