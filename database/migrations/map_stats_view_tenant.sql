-- Migration: map_stats_view porte tenant_id (lot A10, ex-TODO S5c+)
--
-- WHY: la vue agrégeait TOUTES les parties de la plateforme par carte. Lue par
--   /api/admin/stats/maps, elle montrait au staff d'un espace l'agrégat de
--   tous les espaces — une fuite cross-tenant, et des chiffres faux pour lui.
--
-- WHAT: même agrégat, une ligne par (espace, carte) au lieu d'une par carte.
--   Le tenant vient de `games.tenant_id` (NOT NULL, hérité du match) : c'est la
--   même colonne que `team_map_stats` utilise, et la même que le repli
--   applicatif de features/admin/stats/repository.ts — les deux chemins
--   comptent donc exactement les mêmes parties. Passer par matches/tournaments
--   n'apporterait rien (une partie appartient à l'espace de son match) et
--   perdrait les scrims, dont les matchs n'ont pas de tournoi.
--
--   DROP puis CREATE : CREATE OR REPLACE VIEW n'accepte d'ajouter une colonne
--   qu'en FIN de liste, et ne change pas la granularité du GROUP BY sans
--   surprise pour un lecteur. Aucun objet ne dépend de la vue (seul lecteur :
--   la route admin, via service_role).
--
--   security_invoker = on conservé (RLS des tables agrégées appliquée).
--
-- COMPAT: tant que cette migration n'est pas appliquée, la route détecte
--   l'absence de la colonne (42703) et calcule l'agrégat depuis `games` filtré
--   par tenant. Après application : `node scripts/refresh-schema-snapshot.mjs`
--   et régénérer types/database.generated.ts.
--
-- IDEMPOTENT : rejouable.

BEGIN;

DROP VIEW IF EXISTS public.map_stats_view;

CREATE VIEW public.map_stats_view
WITH (security_invoker = on) AS
SELECT g.tenant_id,
       g.map_name,
       count(g.id) AS games_played,
       sum(CASE WHEN g.team1_score > g.team2_score THEN 1 ELSE 0 END) AS wins_team1,
       sum(CASE WHEN g.team2_score > g.team1_score THEN 1 ELSE 0 END) AS wins_team2,
       sum(g.team1_score + g.team2_score) AS total_rounds,
       sum(g.team1_score - g.team2_score) AS diff_team1,
       sum(g.team2_score - g.team1_score) AS diff_team2
  FROM public.games g
 GROUP BY g.tenant_id, g.map_name;

COMMENT ON VIEW public.map_stats_view IS
  'Statistiques par carte et par espace (tenant_id). Alimente /api/admin/stats/maps, toujours filtree par tenant.';

-- Mêmes bénéficiaires que team_map_stats ; plus de droits d'écriture hérités
-- du baseline (une vue d'agrégat n'en a pas l'usage).
REVOKE ALL ON public.map_stats_view FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.map_stats_view TO anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
