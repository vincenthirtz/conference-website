-- Migration: vue team_map_stats (statistiques de cartes par équipe)
--
-- WHY: /team/[slug]/maps interroge `team_map_stats` depuis toujours — une
--   relation qui n'existait NI en table NI en vue. La page journalise l'erreur
--   et rend `mapStats: []` : elle ne plante donc pas, elle affiche simplement
--   des statistiques de cartes éternellement vides. Personne ne l'a vu, parce
--   que rien ne casse visuellement. Détecté par le garde-fou
--   tests/unit/supabaseSelectSchema.test.ts.
--
-- WHAT: une vue d'agrégation, une ligne par (équipe, carte), avec exactement
--   les colonnes que la page consomme — plus `tenant_id`, utile pour filtrer.
--
--   - Chaque `games` est compté DEUX fois, une par camp : la table porte
--     team1_score / team2_score, la page raisonne en « mes rounds » / « ceux
--     de l'adversaire ». D'où le UNION ALL qui déplie le match par équipe.
--   - Victoire : `winner_team_id` fait foi quand il est renseigné ; sinon on
--     compare les scores (même repli que map_stats_view). Une égalité sans
--     vainqueur n'est ni une victoire ni une défaite — elle compte dans
--     games_played, et c'est voulu.
--   - Matchs supprimés (soft-delete) et byes exclus : ni l'un ni l'autre n'est
--     une partie jouée.
--   - `win_rate` est en POURCENTAGE (la page l'affiche tel quel), en float8
--     pour arriver côté client comme un nombre JSON et non une chaîne.
--
--   security_invoker = on : la vue s'exécute avec les droits de l'appelant,
--   donc les RLS de `games` et `matches` s'appliquent — même choix que
--   map_stats_view. Sans ça, la vue contournerait les politiques des tables
--   qu'elle agrège.
--
-- ⚠️ DONNÉES : à ce jour les 17 lignes de `games` portent des noms de carte
--   FACTICES (« Map 1 », « Map 2 »…) et des scores 0/1 (carte gagnée/perdue,
--   pas des rounds), et `match_map_vetos` est vide. La vue est donc correcte
--   mais n'affichera rien de parlant tant que le flux de saisie des scores
--   n'enregistrera pas les vraies cartes (le pool en compte 30).

BEGIN;

CREATE OR REPLACE VIEW public.team_map_stats
WITH (security_invoker = on) AS
WITH per_game AS (
  SELECT g.tenant_id,
         m.team1_id AS team_id,
         g.map_name,
         g.team1_score AS own_score,
         g.team2_score AS opp_score,
         g.winner_team_id
    FROM public.games g
    JOIN public.matches m ON m.id = g.match_id
   WHERE m.deleted_at IS NULL
     AND COALESCE(m.is_bye, false) = false
     AND m.team1_id IS NOT NULL
     AND g.map_name IS NOT NULL
  UNION ALL
  SELECT g.tenant_id,
         m.team2_id,
         g.map_name,
         g.team2_score,
         g.team1_score,
         g.winner_team_id
    FROM public.games g
    JOIN public.matches m ON m.id = g.match_id
   WHERE m.deleted_at IS NULL
     AND COALESCE(m.is_bye, false) = false
     AND m.team2_id IS NOT NULL
     AND g.map_name IS NOT NULL
),
scored AS (
  SELECT p.*,
         CASE WHEN p.winner_team_id IS NOT NULL
              THEN p.winner_team_id = p.team_id
              ELSE COALESCE(p.own_score, 0) > COALESCE(p.opp_score, 0)
         END AS is_win,
         CASE WHEN p.winner_team_id IS NOT NULL
              THEN p.winner_team_id <> p.team_id
              ELSE COALESCE(p.opp_score, 0) > COALESCE(p.own_score, 0)
         END AS is_loss
    FROM per_game p
)
SELECT tenant_id,
       team_id,
       map_name,
       count(*)::int AS games_played,
       count(*) FILTER (WHERE is_win)::int AS wins,
       count(*) FILTER (WHERE is_loss)::int AS losses,
       COALESCE(sum(own_score), 0)::int AS rounds_won,
       COALESCE(sum(opp_score), 0)::int AS rounds_lost,
       round(
         (count(*) FILTER (WHERE is_win))::numeric * 100 / NULLIF(count(*), 0),
         1
       )::float8 AS win_rate
  FROM scored
 GROUP BY tenant_id, team_id, map_name;

COMMENT ON VIEW public.team_map_stats IS
  'Statistiques de cartes par equipe (une ligne par equipe/carte). win_rate en pourcentage. Alimente /team/[slug]/maps.';

-- Mêmes bénéficiaires que map_stats_view / team_stats_view.
GRANT SELECT ON public.team_map_stats TO anon, authenticated, service_role;

COMMIT;
