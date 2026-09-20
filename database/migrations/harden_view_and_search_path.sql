/* ---------------------------------------------------------------------------
 * harden_view_and_search_path.sql — aligner les deux retardataires du
 * durcissement Postgres
 *
 * 1) `team_stats_view` SANS `security_invoker`.
 *
 * Une vue sans cette option s'exécute avec les droits de SON PROPRIÉTAIRE :
 * elle traverse donc la RLS de qui l'interroge. Les tables qu'elle agrège
 * (`matches`, `games`, `teams`) ont la RLS activée SANS politique — c'est-à-dire
 * fermées à `anon` et `authenticated` —, et la vue leur offrait une fenêtre
 * ouverte dessus, par-dessus cette fermeture.
 *
 * CE N'EST PAS UN CHOIX D'ARCHITECTURE, C'EST UN RETARDATAIRE : les deux autres
 * vues du schéma (`map_stats_view`, `team_map_stats`) portent déjà
 * `security_invoker=on`. Celle-ci l'avait manqué, et rien ne le disait.
 *
 * AUCUN LECTEUR N'EST AFFECTÉ — vérifié, pas supposé. Les trois appelants
 * (`pages/team/[slug]/stats.tsx`, `pages/api/team/[id]/stats.ts`,
 * `pages/api/admin/stats/teams.ts`) passent tous par `supabaseAdmin`, donc par
 * `service_role`, qui ignore la RLS de toute façon. Ce qui change est ce qu'un
 * porteur de la clé publique obtient : plus rien, au lieu de tout.
 *
 * 2) Quatre fonctions à `search_path` mutable.
 *
 * Aucune n'est SECURITY DEFINER (vérifié dans `pg_proc`) : le risque est donc
 * FAIBLE — elles s'exécutent déjà avec les droits de l'appelante, qui n'a rien
 * à gagner à se piéger elle-même. On les fixe quand même, parce qu'un
 * `search_path` figé est la condition pour qu'une de ces fonctions puisse
 * devenir SECURITY DEFINER un jour sans ouvrir une faille au passage — et
 * parce qu'un avertissement qu'on laisse traîner finit par masquer le suivant.
 *
 * `pg_catalog` est toujours consulté en premier, quel que soit `search_path` :
 * `introspect_foreign_keys`, qui lit le catalogue, n'est pas gênée.
 *
 * IDEMPOTENT : `ALTER` rejouable, aucune donnée touchée.
 * ------------------------------------------------------------------------- */

BEGIN;

ALTER VIEW public.team_stats_view SET (security_invoker = on);

ALTER FUNCTION public.enforce_team_max_players()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_tenant_lifecycle()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.introspect_foreign_keys()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.consume_api_usage(uuid, text, text)
  SET search_path = public, pg_temp;

COMMIT;

NOTIFY pgrst, 'reload schema';
