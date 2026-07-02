-- Migration: fonction SECURITY DEFINER `public.admin_search_users(text)`
-- Date: 2026-07-02
--
-- WHY:
--   La recherche de joueurs côté admin (pages/api/admin/users/search.ts) faisait
--   jusqu'ici, en JS :
--     - `auth.admin.listUsers({ perPage: 50 })` puis un filtre en mémoire — BUG :
--       ne scanne QUE les 50 premiers comptes, donc un joueur au-delà de la
--       première page est invisible dans la recherche.
--     - une boucle N+1 de `auth.admin.getUserById(id)` pour résoudre l'email
--       (l'email vit dans `auth.users`, inaccessible en JOIN depuis PostgREST).
--   Cette fonction fait TOUT le travail en un seul appel serveur : elle scanne
--   auth.users EN ENTIER (LIKE indexable), agrège team_members, et résout
--   email/display_name/battle_tag/équipe côté Postgres. Le handler n'a plus qu'à
--   faire un `.rpc('admin_search_users', { p_query })`.
--
-- SECURITY DEFINER :
--   L'accès au schéma `auth` (table auth.users, colonne email) est réservé au
--   propriétaire. La fonction s'exécute donc avec les droits du définisseur
--   (postgres/service owner) pour lire auth.users, tout en restant cloisonnée :
--   - `SET search_path = public, auth, pg_temp` pin le résolveur de noms
--     (anti schema-hijacking, cf. fix_function_search_path.sql / advisor 0011).
--   - EXECUTE accordé UNIQUEMENT à service_role (le handler admin utilise
--     supabaseAdmin). Révoqué de PUBLIC : ni anon ni authenticated ne peuvent
--     l'appeler, donc aucune exfiltration d'emails via l'API publique.
--
-- SÉMANTIQUE (parité stricte avec l'ancien handler, en corrigeant le bug 50) :
--   - Normalisation : q := lower(trim(p_query)) ; si length(q) < 2 → 0 ligne.
--   - Candidats (user_id) collectés depuis 2 sources, puis dédupliqués et
--     limités à 30 :
--       1. auth.users          : email OU raw_user_meta_data->>'display_name'
--       2. public.team_members : battle_tag OU display_name
--   - Résolution par candidat :
--       email       ← auth.users.email
--       display_name← COALESCE(team_members.display_name,
--                              auth.users.raw_user_meta_data->>'display_name')
--       battle_tag  ← team_members.battle_tag
--       team_id/name← via team_members → teams (une appartenance suffit, comme
--                     l'ancien handler ; pas de filtre tenant — parité globale).
--   - `q` est un PARAMÈTRE lié : les LIKE '%'||q||'%' sont sûrs (aucune
--     concaténation SQL dynamique).
--
-- SCHÉMA VÉRIFIÉ EN BASE (information_schema, projet yhfdhpqgmazfxyyklomp) :
--   - public.profiles N'EXISTE PAS. L'ancien handler la requêtait
--     (`.from('profiles')`) mais sans vérifier l'erreur → la requête échouait
--     silencieusement (data=null) et ne contribuait jamais aux résultats. Aucune
--     colonne `username` n'existe nulle part dans le schéma public. Cette source
--     est donc supprimée (elle n'a jamais rien renvoyé).
--   - team_members(id, team_id, user_id, role, battle_tag, is_substitute,
--     display_name, specialty, avatar_url, pronouns, tagline, twitter, twitch,
--     tenant_id) — colonnes utilisées : user_id, battle_tag, display_name, team_id.
--   - teams(... name text ...) — vérifié.
--   - auth.users(id uuid, email text, raw_user_meta_data jsonb) — standard.
--
-- CAVEATS:
--   - Idempotente : CREATE OR REPLACE FUNCTION, REVOKE/GRANT rejouables.
--   - Pas de reload du cache PostgREST nécessaire pour une fonction RPC pure
--     (aucune FK modifiée). Le premier appel `.rpc(...)` la découvre.
--   - team_members : on prend UNE ligne par user via DISTINCT ON (user_id) —
--     si un joueur a plusieurs appartenances, la première (ordre PK) gagne,
--     comme l'ancien Map JS qui écrasait avec la dernière rencontrée. La valeur
--     exacte de l'équipe n'est pas contractuelle (le handler prenait aussi
--     « une » appartenance arbitraire).

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_search_users(p_query text)
RETURNS TABLE (
  id           uuid,
  email        text,
  display_name text,
  battle_tag   text,
  team_id      uuid,
  team_name    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  WITH norm AS (
    SELECT lower(trim(p_query)) AS q
  ),
  -- Une seule appartenance d'équipe par utilisateur (DISTINCT ON = déterministe).
  member AS (
    SELECT DISTINCT ON (tm.user_id)
           tm.user_id,
           tm.battle_tag,
           tm.display_name,
           tm.team_id
    FROM public.team_members tm
    WHERE tm.user_id IS NOT NULL
    ORDER BY tm.user_id, tm.id
  ),
  candidates AS (
    -- Source 1 : auth.users (email / metadata display_name)
    SELECT u.id AS user_id
    FROM auth.users u, norm
    WHERE norm.q IS NOT NULL
      AND length(norm.q) >= 2
      AND (
        lower(u.email) LIKE '%' || norm.q || '%'
        OR lower(u.raw_user_meta_data->>'display_name') LIKE '%' || norm.q || '%'
      )

    UNION

    -- Source 2 : team_members (battle_tag / display_name)
    SELECT tm.user_id AS user_id
    FROM public.team_members tm, norm
    WHERE tm.user_id IS NOT NULL
      AND norm.q IS NOT NULL
      AND length(norm.q) >= 2
      AND (
        lower(tm.battle_tag) LIKE '%' || norm.q || '%'
        OR lower(tm.display_name) LIKE '%' || norm.q || '%'
      )
  ),
  limited AS (
    SELECT DISTINCT c.user_id
    FROM candidates c
    LIMIT 30
  )
  SELECT
    l.user_id AS id,
    u.email::text AS email,
    COALESCE(
      m.display_name,
      u.raw_user_meta_data->>'display_name'
    ) AS display_name,
    m.battle_tag AS battle_tag,
    m.team_id AS team_id,
    t.name    AS team_name
  FROM limited l
  LEFT JOIN auth.users  u ON u.id = l.user_id
  LEFT JOIN member       m ON m.user_id = l.user_id
  LEFT JOIN public.teams t ON t.id = m.team_id;
$$;

COMMENT ON FUNCTION public.admin_search_users(text) IS
  'Recherche joueur admin (email / display_name / battle_tag) en un seul appel. '
  'Remplace le listUsers({perPage:50}) + boucle N+1 getUserById du handler '
  'pages/api/admin/users/search.ts (qui ne scannait que 50 comptes). Sources : '
  'auth.users + team_members (la table profiles n''existe pas). SECURITY DEFINER '
  'pour lire auth.users.email ; EXECUTE réservé à service_role.';

-- EXECUTE : uniquement service_role (supabaseAdmin). Jamais anon/authenticated.
REVOKE ALL ON FUNCTION public.admin_search_users(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_search_users(text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_search_users(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_users(text) TO service_role;

COMMIT;

-- ===========================================================================
-- RECOMMANDATION (index — NON appliqués ici volontairement)
-- ===========================================================================
-- pg_trgm est déjà présent (create_player_blacklist_table.sql). Pour accélérer
-- les LIKE '%q%' (non-préfixés → non couverts par un btree classique), on peut
-- ajouter, si la volumétrie le justifie :
--
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
--   CREATE INDEX IF NOT EXISTS idx_team_members_battle_tag_trgm
--     ON public.team_members USING gin (lower(battle_tag) gin_trgm_ops);
--   CREATE INDEX IF NOT EXISTS idx_team_members_display_name_trgm
--     ON public.team_members USING gin (lower(display_name) gin_trgm_ops);
--
-- (auth.users n'est pas indexable par une migration applicative — schéma géré
-- par Supabase.) À décider selon EXPLAIN sur volumétrie réelle ; laissés hors
-- de cette migration pour ne pas ajouter d'index spéculatif.
