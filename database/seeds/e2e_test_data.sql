-- =============================================================================
-- Seed : données de test E2E pour l'app Electron caster (womenscup-caster)
-- =============================================================================
--
-- POURQUOI
--   Fournir un jeu de données complet et auto-suffisant (1 tournoi + équipes +
--   stages + matches + games + maps + scrims) que l'app caster Electron récupère
--   via les API publiques caster/scrims, afin de tester les scènes overlay
--   (match, résultats, scrim…) avec de vraies données plutôt que les
--   DEFAULT_SCENES hors-ligne.
--
-- CONTENU
--   - 1 tournoi  « [E2E] Test Cup 2026 »  (status 'published' → visible API caster)
--   - 4 équipes  « [E2E] Team Nova / Vortex / Pulse / Echo »
--   - 1 stage    « Bracket Principal »
--   - 5 matches  (mix finished / ongoing / pending) + games pour le match fini
--   - 4 maps     Overwatch (enabled)
--   - 3 scrims   (is_public=true, status != draft → visibles /api/scrims) + matches
--
-- IDEMPOTENCE
--   UUIDs fixes + `ON CONFLICT (id) DO NOTHING`. Ré-applicable sans erreur.
--
-- VISIBILITÉ
--   Le tournoi est volontairement `is_public=false` + `visibility='private'` :
--   l'API caster filtre uniquement sur `status IN ('running','published')` (sans
--   is_public), donc l'app le voit, mais les listings publics du site (qui
--   filtrent is_public/visibility) ne l'affichent pas. NB : les scrims n'ont PAS
--   de discriminant équivalent (même endpoint /api/scrims pour le site et l'app).
--
-- NOTE D'APPLICATION  ⚠️
--   À appliquer EXCLUSIVEMENT sur la branche Supabase isolée `e2e-test-data`
--   (jamais sur main/prod). Tenant = conference (ce69a726-…).
--
--   ⚠️ BROUILLON À VÉRIFIER VIA MCP avant apply : colonnes/NOT NULL/CHECK
--   confirmés depuis les migrations mais PAS contre le schéma live. La section
--   JOUEURS (team_members) est laissée en TODO — elle dépend de auth.users
--   (user_id NOT NULL → auth.users) et doit être complétée live (cf. fin).
-- =============================================================================

BEGIN;

-- --- Tournoi ----------------------------------------------------------------
INSERT INTO public.tournaments (
  id, tenant_id, name, slug, game, status,
  start_date, end_date, format_type,
  is_public, is_featured, visibility, description_info
) VALUES (
  'e2e10000-0001-4000-8000-000000000001',
  'ce69a726-773e-4d12-b5eb-d2503aa752b4',
  '[E2E] Test Cup 2026',
  'e2e-test-cup-2026',
  'overwatch',
  'published',
  '2026-07-01 16:00:00+02',
  '2026-07-03 22:00:00+02',
  'double_elim',
  false,       -- is_public : caché des listings publics
  false,
  'private',   -- visibility : idem
  'Tournoi factice pour les tests E2E de l''app caster. Ne pas afficher publiquement.'
) ON CONFLICT (id) DO NOTHING;

-- --- Équipes ----------------------------------------------------------------
INSERT INTO public.teams (id, tenant_id, name, slug, short_name, logo_url, country, is_active)
VALUES
  ('e2e20000-0001-4000-8000-000000000001', 'ce69a726-773e-4d12-b5eb-d2503aa752b4', '[E2E] Team Nova',   'e2e-team-nova',   'NOVA', 'https://placehold.co/128x128/00f0ff/0f0820?text=NOV', 'FR', true),
  ('e2e20000-0002-4000-8000-000000000002', 'ce69a726-773e-4d12-b5eb-d2503aa752b4', '[E2E] Team Vortex', 'e2e-team-vortex', 'VRTX', 'https://placehold.co/128x128/ff2ec8/0f0820?text=VTX', 'BE', true),
  ('e2e20000-0003-4000-8000-000000000003', 'ce69a726-773e-4d12-b5eb-d2503aa752b4', '[E2E] Team Pulse',  'e2e-team-pulse',  'PLSE', 'https://placehold.co/128x128/bb00ff/0f0820?text=PLS', 'CH', true),
  ('e2e20000-0004-4000-8000-000000000004', 'ce69a726-773e-4d12-b5eb-d2503aa752b4', '[E2E] Team Echo',   'e2e-team-echo',   'ECHO', 'https://placehold.co/128x128/10b981/0f0820?text=ECO', 'CA', true)
ON CONFLICT (id) DO NOTHING;

-- --- Stage ------------------------------------------------------------------
INSERT INTO public.tournament_stages (
  id, tenant_id, tournament_id, name, slug, stage_type, order_index, is_active, is_public
) VALUES (
  'e2e30000-0001-4000-8000-000000000001',
  'ce69a726-773e-4d12-b5eb-d2503aa752b4',
  'e2e10000-0001-4000-8000-000000000001',
  'Bracket Principal',
  'bracket-principal',
  'bracket',
  0,
  true,
  true
) ON CONFLICT (id) DO NOTHING;

-- --- Matches (tournoi) ------------------------------------------------------
-- M1 : terminé (Nova 3 - 1 Vortex)  | M2 : en cours (Pulse 1 - 1 Echo)
-- M3, M4 : à venir.  best_of 5, format BO5.
INSERT INTO public.matches (
  id, tenant_id, tournament_id, scrim_id, stage_id, round_number, round_name,
  status, best_of, match_format, scheduled_at, started_at, completed_at,
  team1_id, team2_id, team1_score, team2_score, winner_team_id, stream_url
) VALUES
  ('e2e40000-0001-4000-8000-000000000001', 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
   'e2e10000-0001-4000-8000-000000000001', NULL, 'e2e30000-0001-4000-8000-000000000001',
   1, 'Quart de finale 1', 'finished', 5, 'BO5',
   '2026-07-01 16:00:00+02', '2026-07-01 16:05:00+02', '2026-07-01 17:30:00+02',
   'e2e20000-0001-4000-8000-000000000001', 'e2e20000-0002-4000-8000-000000000002',
   3, 1, 'e2e20000-0001-4000-8000-000000000001', 'https://twitch.tv/womens_cup'),

  ('e2e40000-0002-4000-8000-000000000002', 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
   'e2e10000-0001-4000-8000-000000000001', NULL, 'e2e30000-0001-4000-8000-000000000001',
   1, 'Quart de finale 2', 'ongoing', 5, 'BO5',
   '2026-07-01 18:00:00+02', '2026-07-01 18:03:00+02', NULL,
   'e2e20000-0003-4000-8000-000000000003', 'e2e20000-0004-4000-8000-000000000004',
   1, 1, NULL, 'https://twitch.tv/womens_cup'),

  ('e2e40000-0003-4000-8000-000000000003', 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
   'e2e10000-0001-4000-8000-000000000001', NULL, 'e2e30000-0001-4000-8000-000000000001',
   2, 'Demi-finale 1', 'pending', 5, 'BO5',
   '2026-07-02 18:00:00+02', NULL, NULL,
   'e2e20000-0001-4000-8000-000000000001', 'e2e20000-0003-4000-8000-000000000003',
   0, 0, NULL, NULL),

  ('e2e40000-0004-4000-8000-000000000004', 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
   'e2e10000-0001-4000-8000-000000000001', NULL, 'e2e30000-0001-4000-8000-000000000001',
   2, 'Demi-finale 2', 'pending', 5, 'BO5',
   '2026-07-02 20:00:00+02', NULL, NULL,
   'e2e20000-0002-4000-8000-000000000002', 'e2e20000-0004-4000-8000-000000000004',
   0, 0, NULL, NULL),

  ('e2e40000-0005-4000-8000-000000000005', 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
   'e2e10000-0001-4000-8000-000000000001', NULL, 'e2e30000-0001-4000-8000-000000000001',
   3, 'Finale', 'pending', 7, 'BO7',
   '2026-07-03 20:00:00+02', NULL, NULL,
   NULL, NULL, 0, 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- --- Games (du match terminé M1 : Nova 3 - 1 Vortex) ------------------------
INSERT INTO public.games (
  id, tenant_id, match_id, map_name, map_order, team1_score, team2_score, winner_team_id
) VALUES
  ('e2e50000-0001-4000-8000-000000000001', 'ce69a726-773e-4d12-b5eb-d2503aa752b4', 'e2e40000-0001-4000-8000-000000000001', 'Ilios',        1, 2, 1, 'e2e20000-0001-4000-8000-000000000001'),
  ('e2e50000-0002-4000-8000-000000000002', 'ce69a726-773e-4d12-b5eb-d2503aa752b4', 'e2e40000-0001-4000-8000-000000000001', 'King''s Row',  2, 1, 3, 'e2e20000-0002-4000-8000-000000000002'),
  ('e2e50000-0003-4000-8000-000000000003', 'ce69a726-773e-4d12-b5eb-d2503aa752b4', 'e2e40000-0001-4000-8000-000000000001', 'Hollywood',    3, 3, 2, 'e2e20000-0001-4000-8000-000000000001'),
  ('e2e50000-0004-4000-8000-000000000004', 'ce69a726-773e-4d12-b5eb-d2503aa752b4', 'e2e40000-0001-4000-8000-000000000001', 'Dorado',       4, 3, 1, 'e2e20000-0001-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- --- Maps du tournoi (enabled → visibles /caster/tournaments/[id]/maps) ------
INSERT INTO public.tournament_maps (
  id, tenant_id, tournament_id, map_name, map_type, image_url, enabled
) VALUES
  ('e2e60000-0001-4000-8000-000000000001', 'ce69a726-773e-4d12-b5eb-d2503aa752b4', 'e2e10000-0001-4000-8000-000000000001', 'Ilios',         'control', NULL, true),
  ('e2e60000-0002-4000-8000-000000000002', 'ce69a726-773e-4d12-b5eb-d2503aa752b4', 'e2e10000-0001-4000-8000-000000000001', 'King''s Row',   'hybrid',  NULL, true),
  ('e2e60000-0003-4000-8000-000000000003', 'ce69a726-773e-4d12-b5eb-d2503aa752b4', 'e2e10000-0001-4000-8000-000000000001', 'Hollywood',     'hybrid',  NULL, true),
  ('e2e60000-0004-4000-8000-000000000004', 'ce69a726-773e-4d12-b5eb-d2503aa752b4', 'e2e10000-0001-4000-8000-000000000001', 'Dorado',        'escort',  NULL, true)
ON CONFLICT (id) DO NOTHING;

-- --- Scrims (is_public=true + status != 'draft' → visibles /api/scrims) ------
INSERT INTO public.scrims (
  id, tenant_id, name, slug, game, status,
  team1_id, team2_id, scheduled_date, timezone, is_public, stream_url, description
) VALUES
  ('e2e70000-0001-4000-8000-000000000001', 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
   '[E2E] Scrim Nova vs Vortex', 'e2e-scrim-nova-vortex', 'overwatch', 'scheduled',
   'e2e20000-0001-4000-8000-000000000001', 'e2e20000-0002-4000-8000-000000000002',
   '2026-07-05 19:00:00+02', 'Europe/Paris', true, 'https://twitch.tv/womens_cup',
   'Scrim de test E2E (matchup).'),

  ('e2e70000-0002-4000-8000-000000000002', 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
   '[E2E] Scrim Pulse vs Echo', 'e2e-scrim-pulse-echo', 'overwatch', 'running',
   'e2e20000-0003-4000-8000-000000000003', 'e2e20000-0004-4000-8000-000000000004',
   '2026-07-04 20:30:00+02', 'Europe/Paris', true, 'https://twitch.tv/womens_cup',
   'Scrim de test E2E (en cours).'),

  ('e2e70000-0003-4000-8000-000000000003', 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
   '[E2E] Scrim Nova vs Echo', 'e2e-scrim-nova-echo', 'overwatch', 'completed',
   'e2e20000-0001-4000-8000-000000000001', 'e2e20000-0004-4000-8000-000000000004',
   '2026-07-02 19:00:00+02', 'Europe/Paris', true, NULL,
   'Scrim de test E2E (terminé).')
ON CONFLICT (id) DO NOTHING;

-- --- Matches de scrim (scrim_id set, tournament_id NULL — owner check) -------
INSERT INTO public.matches (
  id, tenant_id, tournament_id, scrim_id, status, best_of, match_format,
  scheduled_at, completed_at, team1_id, team2_id, team1_score, team2_score, winner_team_id
) VALUES
  ('e2e80000-0001-4000-8000-000000000001', 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
   NULL, 'e2e70000-0002-4000-8000-000000000002', 'ongoing', 3, 'BO3',
   '2026-07-04 20:30:00+02', NULL,
   'e2e20000-0003-4000-8000-000000000003', 'e2e20000-0004-4000-8000-000000000004', 1, 0, NULL),

  ('e2e80000-0002-4000-8000-000000000002', 'ce69a726-773e-4d12-b5eb-d2503aa752b4',
   NULL, 'e2e70000-0003-4000-8000-000000000003', 'finished', 3, 'BO3',
   '2026-07-02 19:00:00+02', '2026-07-02 20:15:00+02',
   'e2e20000-0001-4000-8000-000000000001', 'e2e20000-0004-4000-8000-000000000004', 2, 1,
   'e2e20000-0001-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- =============================================================================
-- TODO — JOUEURS (team_members)  ⚠️ à compléter LIVE via MCP
-- =============================================================================
-- `team_members.user_id` est NOT NULL → REFERENCES auth.users(id). Seeder de
-- faux joueurs impose donc de créer d'abord de faux comptes `auth.users` (schéma
-- Supabase managé : colonnes requises instance_id/aud/role/… + triggers), puis
-- d'insérer les team_members (colonnes connues : team_id, user_id, role
-- CHECK(player|coach|substitute|manager), display_name, battle_tag NOT NULL,
-- specialty CHECK(tank|dps|support|flex), avatar_url, tenant_id, is_substitute).
--
-- À faire par l'agent database après `list_tables` sur la branche :
--   1. Vérifier les NOT NULL réels de auth.users + team_members.
--   2. INSERT ~5 auth.users factices par équipe (emails @e2e.local).
--   3. INSERT les team_members correspondants (role 'player', tenant conference).
--
-- L'app caster overlay N'A PAS besoin des joueurs (équipes/scores/maps suffisent) ;
-- ils ne servent qu'au briefing caster (/api/caster/briefing/[matchId]).
-- =============================================================================
