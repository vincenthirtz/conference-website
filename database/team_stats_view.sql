-- Vue matérialisée pour les stats équipes.
-- Source : tables matches / games / teams / tournaments.
-- À exécuter sur Supabase puis REFRESH MATERIALIZED VIEW team_stats_view;

-- Nettoyage préventif : si une simple VIEW existe déjà, on la droppe avant de créer la materialized view.
DROP VIEW IF EXISTS team_stats_view;
DROP MATERIALIZED VIEW IF EXISTS team_stats_view;

CREATE MATERIALIZED VIEW team_stats_view AS
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

-- Index utiles
CREATE INDEX IF NOT EXISTS team_stats_view_team_id_idx ON team_stats_view(team_id);
CREATE INDEX IF NOT EXISTS team_stats_view_tournament_id_idx ON team_stats_view(tournament_id);
CREATE INDEX IF NOT EXISTS team_stats_view_winrate_idx ON team_stats_view(winrate);
