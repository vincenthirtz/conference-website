-- ARCHIVÉ le 2026-06-26 : SEED de données one-shot (matches + games + scores du
--   tournoi 734b6fdb…, IDs forcés). Donnée spécifique, pas du schéma -> non versionné.
--   Conservé pour historique uniquement.
-- =====================================================================

-- Seed matches & maps for tournament 734b6fdb-dfe8-4565-a6b3-38c6423d0929
-- Scores pulled from the /tournoi page (round robin BO3 + final BO5).
-- Assumes the teams "Phénix", "Avoidgers", "Onna Bugeisha" and "Sparkles" already exist in public.teams.

WITH const AS (
  SELECT '734b6fdb-dfe8-4565-a6b3-38c6423d0929'::uuid AS tournament_id
),
existing_group AS (
  SELECT id FROM tournament_stages
  WHERE tournament_id = (SELECT tournament_id FROM const) AND name = 'Phase de poules'
),
group_stage AS (
  INSERT INTO tournament_stages (id, tournament_id, name, stage_type, default_match_format, visible)
  SELECT 'a05d2392-a328-4bc5-83d6-f8f02390ca23'::uuid, (SELECT tournament_id FROM const), 'Phase de poules', 'round_robin', 'bo3', TRUE
  WHERE NOT EXISTS (SELECT 1 FROM existing_group)
  ON CONFLICT (id) DO NOTHING
  RETURNING id
),
group_stage_id AS (
  SELECT id FROM existing_group
  UNION ALL
  SELECT id FROM group_stage
),
existing_final AS (
  SELECT id FROM tournament_stages
  WHERE tournament_id = (SELECT tournament_id FROM const) AND name = 'Grande Finale'
),
final_stage AS (
  INSERT INTO tournament_stages (id, tournament_id, name, stage_type, default_match_format, visible)
  SELECT 'bf104be7-10e6-4105-998d-caacf21fa9c5'::uuid, (SELECT tournament_id FROM const), 'Grande Finale', 'single_elim', 'bo5', TRUE
  WHERE NOT EXISTS (SELECT 1 FROM existing_final)
  ON CONFLICT (id) DO NOTHING
  RETURNING id
),
final_stage_id AS (
  SELECT id FROM existing_final
  UNION ALL
  SELECT id FROM final_stage
),
team_map AS (
  SELECT t.name, teams.id
  FROM (
    VALUES
      ('Phénix', '5ae23cdf-f0bb-42c4-8a1f-94dddeae03b7'::uuid),
      ('Avoidgers', '36af2f6b-f98b-42c3-9595-f1c38ea9e2d1'::uuid),
      ('Onna Bugeisha', '355a4578-8572-4eab-808f-cf318e6d0620'::uuid),
      ('Sparkles', 'db907e05-aaba-4935-8e4a-1da41b073073'::uuid)
  ) AS t(name, forced_id)
  JOIN teams ON teams.id = t.forced_id
),
insert_matches AS (
  INSERT INTO matches (
    id,
    tournament_id,
    stage_id,
    team1_id,
    team2_id,
    team1_score,
    team2_score,
    winner_team_id,
    match_format,
    status,
    round_name,
    round_number,
    scheduled_at,
    completed_at
  )
  VALUES
    -- Round 1
    ('d9f99010-2646-4112-9e74-dba9149c11da', (SELECT tournament_id FROM const), (SELECT id FROM group_stage_id), (SELECT id FROM team_map WHERE name = 'Phénix'), (SELECT id FROM team_map WHERE name = 'Sparkles'), 0, 2, (SELECT id FROM team_map WHERE name = 'Sparkles'), 'bo3', 'completed', 'R1-M1', 1, now(), now()),
    ('4f0f4bff-fe9a-4baa-b5f8-cd419086f0f9', (SELECT tournament_id FROM const), (SELECT id FROM group_stage_id), (SELECT id FROM team_map WHERE name = 'Avoidgers'), (SELECT id FROM team_map WHERE name = 'Onna Bugeisha'), 2, 1, (SELECT id FROM team_map WHERE name = 'Avoidgers'), 'bo3', 'completed', 'R1-M2', 1, now(), now()),
    -- Round 2
    ('dc603eb6-c231-4fec-8877-65d34e021bcb', (SELECT tournament_id FROM const), (SELECT id FROM group_stage_id), (SELECT id FROM team_map WHERE name = 'Onna Bugeisha'), (SELECT id FROM team_map WHERE name = 'Phénix'), 2, 0, (SELECT id FROM team_map WHERE name = 'Onna Bugeisha'), 'bo3', 'completed', 'R2-M1', 2, now(), now()),
    ('c0a42bdb-af6a-4dea-8c40-b60aa58244eb', (SELECT tournament_id FROM const), (SELECT id FROM group_stage_id), (SELECT id FROM team_map WHERE name = 'Avoidgers'), (SELECT id FROM team_map WHERE name = 'Sparkles'), 0, 2, (SELECT id FROM team_map WHERE name = 'Sparkles'), 'bo3', 'completed', 'R2-M2', 2, now(), now()),
    -- Round 3
    ('66807b98-45c2-4ee3-b18e-b493de6018f2', (SELECT tournament_id FROM const), (SELECT id FROM group_stage_id), (SELECT id FROM team_map WHERE name = 'Phénix'), (SELECT id FROM team_map WHERE name = 'Avoidgers'), 2, 1, (SELECT id FROM team_map WHERE name = 'Phénix'), 'bo3', 'completed', 'R3-M1', 3, now(), now()),
    ('ba0656a2-3a6d-4a47-bb85-6f3815b47d79', (SELECT tournament_id FROM const), (SELECT id FROM group_stage_id), (SELECT id FROM team_map WHERE name = 'Onna Bugeisha'), (SELECT id FROM team_map WHERE name = 'Sparkles'), 0, 2, (SELECT id FROM team_map WHERE name = 'Sparkles'), 'bo3', 'completed', 'R3-M2', 3, now(), now()),
    -- Grand Final
    ('fee1b3d6-ee1e-4e2c-b730-b3975da4b777', (SELECT tournament_id FROM const), (SELECT id FROM final_stage_id), (SELECT id FROM team_map WHERE name = 'Sparkles'), (SELECT id FROM team_map WHERE name = 'Onna Bugeisha'), 3, 0, (SELECT id FROM team_map WHERE name = 'Sparkles'), 'bo5', 'completed', 'FINAL', 4, now(), now())
  ON CONFLICT (id) DO NOTHING
  RETURNING id, round_name
),
resolved_matches AS (
  -- Use inserted rows, and if they already existed, fall back to existing matches of the tournament by round_name
  SELECT id, round_name FROM insert_matches
  UNION
  SELECT m.id, m.round_name
  FROM matches m
  WHERE m.tournament_id = (SELECT tournament_id FROM const)
    AND m.round_name IN ('R1-M1','R1-M2','R2-M1','R2-M2','R3-M1','R3-M2','FINAL')
),
upsert_matches AS (
  -- Ensure existing matches have correct team ids and winner according to the authoritative mapping
  UPDATE matches m
  SET
    team1_id = t1.id,
    team2_id = t2.id,
    winner_team_id = tw.id
  FROM (
    VALUES
      ('R1-M1', 'Phénix', 'Sparkles', 'Sparkles'),
      ('R1-M2', 'Avoidgers', 'Onna Bugeisha', 'Avoidgers'),
      ('R2-M1', 'Onna Bugeisha', 'Phénix', 'Onna Bugeisha'),
      ('R2-M2', 'Avoidgers', 'Sparkles', 'Sparkles'),
      ('R3-M1', 'Phénix', 'Avoidgers', 'Phénix'),
      ('R3-M2', 'Onna Bugeisha', 'Sparkles', 'Sparkles'),
      ('FINAL', 'Sparkles', 'Onna Bugeisha', 'Sparkles')
  ) AS mapping(round_name, team1_name, team2_name, winner_name)
  JOIN team_map t1 ON t1.name = mapping.team1_name
  JOIN team_map t2 ON t2.name = mapping.team2_name
  JOIN team_map tw ON tw.name = mapping.winner_name
  WHERE m.round_name = mapping.round_name
    AND m.tournament_id = (SELECT tournament_id FROM const)
  RETURNING m.id
)
INSERT INTO games (
  id,
  match_id,
  map_name,
  map_order,
  team1_score,
  team2_score,
  is_tiebreaker,
  went_overtime
)
VALUES
  -- R1-M1 (Phénix 0 - 2 Sparkles)
  ('9f62deaf-c594-45ba-9671-ef62b36ad63f', (SELECT id FROM resolved_matches WHERE round_name = 'R1-M1'), 'Map 1', 1, 0, 1, FALSE, FALSE),
  ('d4ed2d99-ba7e-49c8-a056-9dd1e76f574d', (SELECT id FROM resolved_matches WHERE round_name = 'R1-M1'), 'Map 2', 2, 0, 1, FALSE, FALSE),
  -- R1-M2 (Avoidgers 2 - 1 Onna Bugeisha)
  ('16d47811-a028-42b9-93ec-a1d458ddd893', (SELECT id FROM resolved_matches WHERE round_name = 'R1-M2'), 'Map 1', 1, 1, 0, FALSE, FALSE),
  ('b3c6af7a-a7b9-434e-8e8a-595ba351b3a6', (SELECT id FROM resolved_matches WHERE round_name = 'R1-M2'), 'Map 2', 2, 0, 1, FALSE, FALSE),
  ('ea39486b-6be5-4af8-aa57-6571dace8259', (SELECT id FROM resolved_matches WHERE round_name = 'R1-M2'), 'Map 3', 3, 1, 0, FALSE, FALSE),
  -- R2-M1 (Onna Bugeisha 2 - 0 Phénix)
  ('99ded6dd-ee95-43ea-bec6-b6f67b4b1c96', (SELECT id FROM resolved_matches WHERE round_name = 'R2-M1'), 'Map 1', 1, 1, 0, FALSE, FALSE),
  ('1a7019bb-c015-48eb-8b44-936f51f16d40', (SELECT id FROM resolved_matches WHERE round_name = 'R2-M1'), 'Map 2', 2, 1, 0, FALSE, FALSE),
  -- R2-M2 (Avoidgers 0 - 2 Sparkles)
  ('6974e3eb-5048-4af9-a187-b6081baff792', (SELECT id FROM resolved_matches WHERE round_name = 'R2-M2'), 'Map 1', 1, 0, 1, FALSE, FALSE),
  ('7e9ce8d6-916d-4d08-be90-0db1596db843', (SELECT id FROM resolved_matches WHERE round_name = 'R2-M2'), 'Map 2', 2, 0, 1, FALSE, FALSE),
  -- R3-M1 (Phénix 2 - 1 Avoidgers)
  ('ea5876d0-4d3d-43cf-8675-0805795e3e67', (SELECT id FROM resolved_matches WHERE round_name = 'R3-M1'), 'Map 1', 1, 1, 0, FALSE, FALSE),
  ('493b85c8-d7be-45b3-8dee-76221c35d88a', (SELECT id FROM resolved_matches WHERE round_name = 'R3-M1'), 'Map 2', 2, 0, 1, FALSE, FALSE),
  ('1761d0d7-e979-45aa-a7a3-25e4cea57754', (SELECT id FROM resolved_matches WHERE round_name = 'R3-M1'), 'Map 3', 3, 1, 0, FALSE, FALSE),
  -- R3-M2 (Onna Bugeisha 0 - 2 Sparkles)
  ('7402a40a-f484-4d2c-ba12-3f3f17ddb70e', (SELECT id FROM resolved_matches WHERE round_name = 'R3-M2'), 'Map 1', 1, 0, 1, FALSE, FALSE),
  ('d85ff4ec-e736-4ef8-b228-b7dbaaa098aa', (SELECT id FROM resolved_matches WHERE round_name = 'R3-M2'), 'Map 2', 2, 0, 1, FALSE, FALSE),
  -- Finale (Sparkles 3 - 0 Onna Bugeisha)
  ('22829aaa-6a62-4565-af11-745604f03528', (SELECT id FROM resolved_matches WHERE round_name = 'FINAL'), 'Map 1', 1, 1, 0, FALSE, FALSE),
  ('251b83a9-9c5d-48c6-b4af-256c2ada5c3e', (SELECT id FROM resolved_matches WHERE round_name = 'FINAL'), 'Map 2', 2, 1, 0, FALSE, FALSE),
  ('c4d68285-fecf-49b3-80e1-b00c14889434', (SELECT id FROM resolved_matches WHERE round_name = 'FINAL'), 'Map 3', 3, 1, 0, FALSE, FALSE)
ON CONFLICT (id) DO NOTHING;
