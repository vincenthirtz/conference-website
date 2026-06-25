-- Migration: remplacer la MATERIALIZED VIEW `team_stats_view` par une VIEW
-- Date: 2026-06-25
-- Source historique (loose, non versionnée) : database/team_stats_view.sql
--
-- WHY:
--   `team_stats_view` était une MATERIALIZED VIEW. Aucun `REFRESH MATERIALIZED
--   VIEW team_stats_view` n'existe nulle part dans le code (ni handler, ni cron,
--   ni hook de fin de match) — vérifié par grep sur pages/ utils/ database/.
--   Conséquence : les stats d'équipe étaient FIGÉES à l'instant de création de
--   la matview et ne reflétaient plus jamais les matches/games suivants.
--   Bug de fraîcheur silencieux.
--
--   Choix : repasser en VIEW NON-MATÉRIALISÉE (CREATE OR REPLACE VIEW).
--   Justification :
--     - La requête sous-jacente est une agrégation légère :
--       matches LEFT JOIN games, GROUP BY, puis deux LEFT JOIN finaux vers
--       teams / tournaments. Volumétrie de l'ordre des tournois/matches, pas
--       des millions de lignes -> temps réel acceptable.
--     - Tous les consommateurs filtrent sur team_id et/ou tournament_id
--       (colonnes indexées sur les tables sources matches/games) : PostgreSQL
--       pousse ces prédicats dans la requête, pas de full scan de la vue.
--     - Une VIEW est toujours à jour par construction : supprime DÉFINITIVEMENT
--       le bug de fraîcheur, sans cron de refresh ni hook applicatif à maintenir.
--   Si la volumétrie explosait un jour, on pourrait revenir à une matview AVEC
--   un `REFRESH MATERIALIZED VIEW CONCURRENTLY team_stats_view` déclenché après
--   complétion de match (status -> 'completed') ou via cron — mais ce n'est pas
--   justifié aujourd'hui.
--
-- WHAT:
--   - DROP MATERIALIZED VIEW IF EXISTS team_stats_view (+ DROP VIEW IF EXISTS au
--     cas où l'objet aurait déjà été converti par un autre chemin) : on ne
--     présume pas de l'état prod.
--   - CREATE OR REPLACE VIEW team_stats_view avec EXACTEMENT les mêmes colonnes
--     et la même logique que la matview historique (aucun consommateur cassé).
--   - Les index propres à la matview (team_stats_view_*_idx) disparaissent avec
--     le DROP : une VIEW n'a pas d'index, les filtres s'appuient sur les index
--     des tables sources. Rien à recréer.
--
-- CONSOMMATEURS (tous en pur SELECT -> compatibles VIEW, aucun comportement
-- spécifique aux matviews) :
--   - pages/api/team/[id]/stats.ts
--   - pages/api/admin/stats/teams.ts
--   - pages/api/bot/v1/players/by-discord/[discordUserId]/stats.ts
--   - pages/team/[slug]/stats.tsx
--
-- TENANT:
--   La vue n'expose PAS de tenant_id (les tables matches/games en ont un mais
--   l'agrégation historique ne le remonte pas). Les appelants contournent en
--   bornant les tournament_id au tenant courant (cf. TODO(S5c+) dans
--   pages/api/admin/stats/teams.ts). On NE l'ajoute PAS ici pour ne pas changer
--   la forme de la vue et risquer un GROUP BY ambigu (un tournament_id est déjà
--   1:1 avec un tenant_id côté table tournaments) -> contournement existant
--   suffisant et sûr. Voir TODO ci-dessous.
--   TODO(tenant): si on veut filtrer la vue directement par tenant, ajouter
--   `m.tenant_id` dans match_maps / per_team / agg et le remonter en colonne
--   `tenant_id` finale, puis adapter les appelants (.eq('tenant_id', ...)).
--   Tâche additive, à traiter dans une migration dédiée + ajustement API.
--
-- CAVEATS:
--   - Idempotente : DROP ... IF EXISTS puis CREATE OR REPLACE VIEW.
--   - PostgREST schema cache reload requis (l'objet team_stats_view change de
--     nature matview -> view). Voir NOTIFY en fin de fichier.

BEGIN;

-- Nettoyage : on droppe l'objet quelle que soit sa nature actuelle.
DROP MATERIALIZED VIEW IF EXISTS public.team_stats_view;
DROP VIEW IF EXISTS public.team_stats_view;

CREATE OR REPLACE VIEW public.team_stats_view AS
WITH match_maps AS (
  SELECT
    m.id,
    m.tournament_id,
    m.completed_at,
    m.team1_id,
    m.team2_id,
    m.team1_score,
    m.team2_score,
    m.winner_team_id,
    COALESCE(SUM(g.team1_score), 0) AS g_team1_maps,
    COALESCE(SUM(g.team2_score), 0) AS g_team2_maps
  FROM matches m
  LEFT JOIN games g ON g.match_id = m.id
  WHERE m.status = 'completed'
  GROUP BY m.id
),
per_team AS (
  -- perspective équipe 1
  SELECT
    tournament_id,
    team1_id AS team_id,
    completed_at,
    winner_team_id,
    team1_score,
    team2_score,
    g_team1_maps AS maps_for,
    g_team2_maps AS maps_against
  FROM match_maps
  UNION ALL
  -- perspective équipe 2
  SELECT
    tournament_id,
    team2_id AS team_id,
    completed_at,
    winner_team_id,
    team2_score AS team1_score,
    team1_score AS team2_score,
    g_team2_maps AS maps_for,
    g_team1_maps AS maps_against
  FROM match_maps
),
agg AS (
  SELECT
    pt.team_id,
    pt.tournament_id,
    COUNT(*) AS matches_played,
    SUM(CASE WHEN pt.winner_team_id = pt.team_id THEN 1 ELSE 0 END) AS wins,
    SUM(CASE WHEN pt.winner_team_id IS NULL AND pt.team1_score = pt.team2_score THEN 1 ELSE 0 END) AS draws,
    SUM(CASE WHEN pt.winner_team_id IS NOT NULL AND pt.winner_team_id <> pt.team_id THEN 1 ELSE 0 END) AS losses,
    SUM(pt.maps_for) AS maps_won,
    SUM(pt.maps_against) AS maps_lost,
    MAX(pt.completed_at) AS last_match_at
  FROM per_team pt
  GROUP BY pt.team_id, pt.tournament_id
)
SELECT
  a.team_id,
  t.name AS team_name,
  t.short_name AS team_short_name,
  t.logo_url AS team_logo_url,
  a.tournament_id,
  tour.name AS tournament_name,
  tour.slug AS tournament_slug,
  a.matches_played,
  a.wins,
  a.losses,
  a.draws,
  a.maps_won,
  a.maps_lost,
  0::integer AS map_ties,
  CASE WHEN a.matches_played > 0 THEN a.wins::float / a.matches_played ELSE NULL END AS winrate,
  CASE
    WHEN (a.maps_won + a.maps_lost) > 0
      THEN a.maps_won::float / NULLIF((a.maps_won + a.maps_lost), 0)
    ELSE NULL
  END AS map_winrate,
  (a.wins * 3 + a.draws) AS points,
  a.last_match_at
FROM agg a
LEFT JOIN teams t ON t.id = a.team_id
LEFT JOIN tournaments tour ON tour.id = a.tournament_id;

COMMENT ON VIEW public.team_stats_view IS
  'Stats agrégées par (team_id, tournament_id) calculées en temps réel depuis matches/games. Anciennement MATERIALIZED VIEW jamais rafraîchie (stats figées) -> convertie en VIEW le 2026-06-25 pour fraîcheur garantie. Pas de tenant_id : appelants bornent par tournament_id du tenant.';

COMMIT;

-- ===========================================================================
-- PostgREST schema cache reload
-- ===========================================================================
--
-- REQUIS : l'objet team_stats_view change de nature (matview -> view). Sans
-- reload, PostgREST peut continuer à exposer l'ancienne définition / échouer
-- sur la résolution du schéma. Côté Supabase : Settings > API > "Reload schema
-- cache", ou le NOTIFY ci-dessous.

NOTIFY pgrst, 'reload schema';
