-- Seed data: Overwatch 2 Competitive Maps
-- Insert all competitive maps with their official images
-- Note: Replace 'e8fa740c-d92b-49d8-a654-05a37d0eea3b' with the actual tournament UUID

-- CONTROL MAPS
INSERT INTO public.tournament_maps (
  tournament_id,
  map_name,
  map_type,
  image_url,
  enabled,
  order_index
)
VALUES
  -- Control
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Antarctic Peninsula', 'control', 'https://overwatch.blizzard.com/static/media/screenshots/maps/antarctic-peninsula.jpg', true, 1),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Busan', 'control', 'https://overwatch.blizzard.com/static/media/screenshots/maps/busan.jpg', true, 2),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Hanaoka', 'control', 'https://overwatch.blizzard.com/static/media/screenshots/maps/hanaoka.jpg', true, 3),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Ilios', 'control', 'https://overwatch.blizzard.com/static/media/screenshots/maps/ilios.jpg', true, 4),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Lijiang Tower', 'control', 'https://overwatch.blizzard.com/static/media/screenshots/maps/lijiang-tower.jpg', true, 5),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Nepal', 'control', 'https://overwatch.blizzard.com/static/media/screenshots/maps/nepal.jpg', true, 6),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Oasis', 'control', 'https://overwatch.blizzard.com/static/media/screenshots/maps/oasis.jpg', true, 7),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Samoa', 'control', 'https://overwatch.blizzard.com/static/media/screenshots/maps/samoa.jpg', true, 8),

  -- Escort
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Circuit Royal', 'escort', 'https://overwatch.blizzard.com/static/media/screenshots/maps/circuit-royal.jpg', true, 9),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Dorado', 'escort', 'https://overwatch.blizzard.com/static/media/screenshots/maps/dorado.jpg', true, 10),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Havana', 'escort', 'https://overwatch.blizzard.com/static/media/screenshots/maps/havana.jpg', true, 11),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Junkertown', 'escort', 'https://overwatch.blizzard.com/static/media/screenshots/maps/junkertown.jpg', true, 12),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Rialto', 'escort', 'https://overwatch.blizzard.com/static/media/screenshots/maps/rialto.jpg', true, 13),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Route 66', 'escort', 'https://overwatch.blizzard.com/static/media/screenshots/maps/route-66.jpg', true, 14),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Shambali Monastery', 'escort', 'https://overwatch.blizzard.com/static/media/screenshots/maps/shambali-monastery.jpg', true, 15),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Watchpoint: Gibraltar', 'escort', 'https://overwatch.blizzard.com/static/media/screenshots/maps/watchpoint-gibraltar.jpg', true, 16),

  -- Hybrid
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Blizzard World', 'hybrid', 'https://overwatch.blizzard.com/static/media/screenshots/maps/blizzard-world.jpg', true, 17),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Eichenwalde', 'hybrid', 'https://overwatch.blizzard.com/static/media/screenshots/maps/eichenwalde.jpg', true, 18),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Hollywood', 'hybrid', 'https://overwatch.blizzard.com/static/media/screenshots/maps/hollywood.jpg', true, 19),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'King''s Row', 'hybrid', 'https://overwatch.blizzard.com/static/media/screenshots/maps/kings-row.jpg', true, 20),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Midtown', 'hybrid', 'https://overwatch.blizzard.com/static/media/screenshots/maps/midtown.jpg', true, 21),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Numbani', 'hybrid', 'https://overwatch.blizzard.com/static/media/screenshots/maps/numbani.jpg', true, 22),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Paraíso', 'hybrid', 'https://overwatch.blizzard.com/static/media/screenshots/maps/paraiso.jpg', true, 23),

  -- Push
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Colosseo', 'push', 'https://overwatch.blizzard.com/static/media/screenshots/maps/colosseo.jpg', true, 24),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Esperança', 'push', 'https://overwatch.blizzard.com/static/media/screenshots/maps/esperanca.jpg', true, 25),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'New Queen Street', 'push', 'https://overwatch.blizzard.com/static/media/screenshots/maps/new-queen-street.jpg', true, 26),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Runasapi', 'push', 'https://overwatch.blizzard.com/static/media/screenshots/maps/runasapi.jpg', true, 27),

  -- Flashpoint
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'New Junk City', 'flashpoint', 'https://overwatch.blizzard.com/static/media/screenshots/maps/new-junk-city.jpg', true, 28),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Suravasa', 'flashpoint', 'https://overwatch.blizzard.com/static/media/screenshots/maps/suravasa.jpg', true, 29),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', 'Throne of Aatlis', 'flashpoint', 'https://overwatch.blizzard.com/static/media/screenshots/maps/throne-of-aatlis.jpg', true, 30)
ON CONFLICT DO NOTHING;
