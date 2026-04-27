-- Seed schedule for women's tournament e8fa740c-d92b-49d8-a654-05a37d0eea3b
-- 56 matches across 14 rounds (J), 8 participants playing a double round-robin.
-- Teams are not yet assigned (team1_id/team2_id NULL); the seeded participant slots
-- ("1er", "2e", ...) are kept in the notes column so they can be mapped later.
--
-- Timezones (Europe/Paris):
--   - up to 2026-10-25  -> CEST (+02:00)
--   - from 2026-10-26   -> CET  (+01:00)

INSERT INTO matches (
  tournament_id,
  stage_id,
  team1_id,
  team2_id,
  team1_score,
  team2_score,
  winner_team_id,
  status,
  round_name,
  round_number,
  scheduled_at,
  notes
)
VALUES
  -- J1
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J1', 1, '2026-09-18 19:00:00+02:00', '1er participant vs 2e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J1', 1, '2026-09-18 20:30:00+02:00', '3e participant vs 4e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J1', 1, '2026-09-18 22:00:00+02:00', '7e participant vs 8e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J1', 1, '2026-09-23 19:00:00+02:00', '4e participant vs 1er participant'),
  -- J2
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J2', 2, '2026-09-23 20:30:00+02:00', '5e participant vs 6e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J2', 2, '2026-09-23 22:00:00+02:00', '2e participant vs 6e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J2', 2, '2026-09-25 19:00:00+02:00', '3e participant vs 8e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J2', 2, '2026-09-25 20:30:00+02:00', '5e participant vs 7e participant'),
  -- J3
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J3', 3, '2026-09-25 22:00:00+02:00', '1er participant vs 6e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J3', 3, '2026-09-30 19:00:00+02:00', '4e participant vs 8e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J3', 3, '2026-09-30 20:30:00+02:00', '2e participant vs 7e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J3', 3, '2026-09-30 22:00:00+02:00', '3e participant vs 5e participant'),
  -- J4
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J4', 4, '2026-10-02 19:00:00+02:00', '8e participant vs 1er participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J4', 4, '2026-10-02 20:30:00+02:00', '6e participant vs 7e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J4', 4, '2026-10-02 22:00:00+02:00', '4e participant vs 5e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J4', 4, '2026-10-07 19:00:00+02:00', '2e participant vs 3e participant'),
  -- J5
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J5', 5, '2026-10-07 20:30:00+02:00', '1er participant vs 7e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J5', 5, '2026-10-07 22:00:00+02:00', '8e participant vs 5e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J5', 5, '2026-10-09 19:00:00+02:00', '6e participant vs 3e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J5', 5, '2026-10-09 20:30:00+02:00', '4e participant vs 2e participant'),
  -- J6
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J6', 6, '2026-10-09 22:00:00+02:00', '5e participant vs 1er participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J6', 6, '2026-10-14 19:00:00+02:00', '7e participant vs 3e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J6', 6, '2026-10-14 20:30:00+02:00', '8e participant vs 2e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J6', 6, '2026-10-14 22:00:00+02:00', '6e participant vs 4e participant'),
  -- J7
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J7', 7, '2026-10-16 19:00:00+02:00', '1er participant vs 3e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J7', 7, '2026-10-16 20:30:00+02:00', '5e participant vs 2e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J7', 7, '2026-10-16 22:00:00+02:00', '7e participant vs 4e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J7', 7, '2026-10-21 19:00:00+02:00', '8e participant vs 6e participant'),
  -- J8
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J8', 8, '2026-10-21 20:30:00+02:00', '2e participant vs 1er participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J8', 8, '2026-10-21 22:00:00+02:00', '4e participant vs 3e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J8', 8, '2026-10-23 19:00:00+02:00', '6e participant vs 5e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J8', 8, '2026-10-23 20:30:00+02:00', '8e participant vs 7e participant'),
  -- J9
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J9', 9, '2026-10-23 22:00:00+02:00', '1er participant vs 4e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J9', 9, '2026-10-28 19:00:00+01:00', '6e participant vs 2e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J9', 9, '2026-10-28 20:30:00+01:00', '8e participant vs 3e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J9', 9, '2026-10-28 22:00:00+01:00', '7e participant vs 5e participant'),
  -- J10
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J10', 10, '2026-10-30 19:00:00+01:00', '6e participant vs 1er participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J10', 10, '2026-10-30 20:30:00+01:00', '8e participant vs 4e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J10', 10, '2026-10-30 22:00:00+01:00', '7e participant vs 2e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J10', 10, '2026-11-04 19:00:00+01:00', '5e participant vs 3e participant'),
  -- J11
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J11', 11, '2026-11-04 20:30:00+01:00', '1er participant vs 8e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J11', 11, '2026-11-04 22:00:00+01:00', '7e participant vs 6e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J11', 11, '2026-11-06 19:00:00+01:00', '5e participant vs 4e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J11', 11, '2026-11-06 20:30:00+01:00', '3e participant vs 2e participant'),
  -- J12
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J12', 12, '2026-11-06 22:00:00+01:00', '7e participant vs 1er participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J12', 12, '2026-11-11 19:00:00+01:00', '5e participant vs 8e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J12', 12, '2026-11-11 20:30:00+01:00', '3e participant vs 6e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J12', 12, '2026-11-11 22:00:00+01:00', '2e participant vs 4e participant'),
  -- J13
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J13', 13, '2026-11-13 19:00:00+01:00', '1er participant vs 5e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J13', 13, '2026-11-13 20:30:00+01:00', '3e participant vs 7e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J13', 13, '2026-11-13 22:00:00+01:00', '2e participant vs 8e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J13', 13, '2026-11-18 19:00:00+01:00', '4e participant vs 6e participant'),
  -- J14
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J14', 14, '2026-11-18 20:30:00+01:00', '3e participant vs 1er participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J14', 14, '2026-11-18 22:00:00+01:00', '2e participant vs 5e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J14', 14, '2026-11-20 19:00:00+01:00', '4e participant vs 7e participant'),
  ('e8fa740c-d92b-49d8-a654-05a37d0eea3b', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 'J14', 14, '2026-11-20 21:00:00+01:00', '6e participant vs 8e participant');
