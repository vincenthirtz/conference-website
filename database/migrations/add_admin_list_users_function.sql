-- Migration: fonction SECURITY DEFINER `public.admin_list_users(text, text, int, int)`
-- Date: 2026-07-10
--
-- WHY (audit perf P1):
--   La liste admin des utilisateurs (pages/api/admin/users/manage.ts, GET) faisait
--   jusqu'ici, en JS :
--     - une boucle `auth.admin.listUsers({ perPage: 200 })` sur JUSQU'À 50 pages
--       (soit 10 000 comptes chargés EN MÉMOIRE à chaque requête) ;
--     - un enrichissement N+1 des team_members via `.in('user_id', userIds)` ;
--     - un filtrage / tri / slice de pagination ENTIÈREMENT côté Node.
--   Sur une page de liste paginée (20 lignes affichées), on rapatriait donc la
--   base d'utilisateurs complète à chaque frappe de recherche / changement de
--   page. Cette fonction pousse filtre + tri + pagination + total dans Postgres :
--   le handler n'a plus qu'à faire un `.rpc('admin_list_users', { ... })` et
--   renvoyer directement `items` (les lignes) + `total` (total_count).
--
-- SECURITY DEFINER :
--   L'accès au schéma `auth` (table auth.users : email, raw_user_meta_data,
--   created_at, last_sign_in_at) est réservé au propriétaire. La fonction
--   s'exécute avec les droits du définisseur pour lire auth.users, tout en
--   restant cloisonnée :
--   - `SET search_path = public, auth, pg_temp` pin le résolveur de noms
--     (anti schema-hijacking, cf. fix_function_search_path.sql / advisor 0011).
--   - EXECUTE accordé UNIQUEMENT à service_role (le handler admin utilise
--     supabaseAdmin). Révoqué de PUBLIC / anon / authenticated : aucune
--     exfiltration d'emails ou de métadonnées via l'API publique.
--
-- SÉMANTIQUE (parité STRICTE avec le handler GET actuel) :
--   - Source = auth.users. role = raw_user_meta_data->>'role' ;
--     display_name = raw_user_meta_data->>'display_name' ; email / created_at /
--     last_sign_in_at = colonnes auth.users.
--   - Normalisation : q := lower(trim(p_query)), r := lower(trim(p_role)).
--     NULL ou chaîne vide => filtre correspondant désactivé.
--   - Filtre rôle : quand r non vide, lower(role) = r (égalité insensible à la
--     casse, exactement comme `(u.role||'').toLowerCase() !== roleFilter.toLowerCase()`).
--   - Filtre recherche : quand q non vide, match si l'UN des 4 axes contient q :
--       1. lower(email)        LIKE '%q%'
--       2. lower(display_name) LIKE '%q%'
--       3. lower(role)         LIKE '%q%'
--       4. EXISTS un team_members du user dont lower(battle_tag) LIKE '%q%'
--     (le handler testait email/display_name/role via .includes() + battle_tag
--      via team_memberships[].battle_tag — reproduit à l'identique).
--   - Tri : ORDER BY created_at DESC (le handler triait created_at décroissant),
--     avec tie-breaker déterministe `, id` pour une pagination STABLE (le tri JS
--     par Date.parse n'était pas stable sur créations simultanées).
--   - Pagination : LIMIT p_limit OFFSET p_offset. Les bornes (1..200 / >=0) sont
--     appliquées CÔTÉ HANDLER ; la fonction applique les valeurs telles quelles.
--   - total_count = count(*) OVER() sur l'ensemble FILTRÉ (avant limit/offset),
--     répété sur chaque ligne renvoyée.
--
-- CAVEAT total_count sur page vide :
--   count(*) OVER() est une fenêtre calculée PAR LIGNE renvoyée. Quand p_offset
--   dépasse le total filtré, la fonction renvoie 0 ligne, donc AUCUN total_count
--   n'est disponible. C'est ACCEPTÉ : le handler retombe alors sur total = 0
--   (pas de ligne => pas de total à lire). On NE tente PAS d'artifice
--   (UNION d'une ligne sentinelle, sous-requête count séparée…) pour renvoyer le
--   total sur 0 ligne — la fonction reste simple et à un seul scan filtré.
--
-- SCHÉMA VÉRIFIÉ :
--   - auth.users(id uuid, email text, raw_user_meta_data jsonb, created_at
--     timestamptz, last_sign_in_at timestamptz) — standard GoTrue.
--   - public.team_members(user_id, battle_tag, …) — colonnes utilisées :
--     user_id, battle_tag.
--
-- CAVEATS :
--   - Idempotente : CREATE OR REPLACE FUNCTION, REVOKE/GRANT rejouables.
--   - Pas de reload du cache PostgREST nécessaire (fonction RPC pure, aucune FK
--     modifiée). Le premier appel `.rpc(...)` la découvre.
--   - `q` / `r` sont des paramètres liés : les LIKE '%'||q||'%' sont sûrs
--     (aucune concaténation SQL dynamique).

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_query  text DEFAULT NULL,
  p_role   text DEFAULT NULL,
  p_limit  int  DEFAULT 20,
  p_offset int  DEFAULT 0
)
RETURNS TABLE (
  id              uuid,
  email           text,
  role            text,
  display_name    text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  total_count     bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  WITH norm AS (
    SELECT
      NULLIF(lower(trim(p_query)), '') AS q,
      NULLIF(lower(trim(p_role)),  '') AS r
  ),
  filtered AS (
    SELECT
      u.id,
      u.email::text                                   AS email,
      lower(u.raw_user_meta_data->>'role')            AS role,
      u.raw_user_meta_data->>'display_name'           AS display_name,
      u.created_at,
      u.last_sign_in_at
    FROM auth.users u, norm
    WHERE
      -- Filtre rôle : égalité insensible à la casse (désactivé si r NULL).
      (norm.r IS NULL OR lower(u.raw_user_meta_data->>'role') = norm.r)
      -- Filtre recherche : 4 axes en OR (désactivé si q NULL).
      AND (
        norm.q IS NULL
        OR lower(u.email) LIKE '%' || norm.q || '%'
        OR lower(u.raw_user_meta_data->>'display_name') LIKE '%' || norm.q || '%'
        OR lower(u.raw_user_meta_data->>'role') LIKE '%' || norm.q || '%'
        OR EXISTS (
          SELECT 1
          FROM public.team_members tm
          WHERE tm.user_id = u.id
            AND lower(tm.battle_tag) LIKE '%' || norm.q || '%'
        )
      )
  )
  SELECT
    f.id,
    f.email,
    f.role,
    f.display_name,
    f.created_at,
    f.last_sign_in_at,
    count(*) OVER() AS total_count
  FROM filtered f
  ORDER BY f.created_at DESC, f.id
  LIMIT p_limit OFFSET p_offset;
$$;

COMMENT ON FUNCTION public.admin_list_users(text, text, int, int) IS
  'Liste admin paginée des utilisateurs (audit perf P1). Filtre rôle (égalité '
  'insensible casse), recherche 4 axes (email / display_name / role / battle_tag '
  'via team_members), tri created_at DESC + id, pagination LIMIT/OFFSET et '
  'total_count = count(*) OVER() sur l''ensemble filtré. Remplace la boucle '
  'listUsers({perPage:200}) + filtrage/tri/slice en mémoire du handler '
  'pages/api/admin/users/manage.ts (GET). SECURITY DEFINER pour lire '
  'auth.users ; EXECUTE réservé à service_role.';

-- EXECUTE : uniquement service_role (supabaseAdmin). Jamais anon/authenticated.
REVOKE ALL ON FUNCTION public.admin_list_users(text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users(text, text, int, int) FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_users(text, text, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, text, int, int) TO service_role;

COMMIT;

-- ===========================================================================
-- RECOMMANDATION (index — NON appliqués ici volontairement)
-- ===========================================================================
-- Le tri se fait sur auth.users.created_at (schéma géré par Supabase, non
-- indexable par une migration applicative). Pour accélérer l'axe battle_tag de
-- la recherche (LIKE '%q%' non-préfixé → non couvert par un btree classique),
-- pg_trgm étant déjà présent (create_player_blacklist_table.sql), on POURRAIT
-- ajouter, si la volumétrie le justifie (à décider sur EXPLAIN réel) :
--
--   CREATE EXTENSION IF NOT EXISTS pg_trgm;
--   CREATE INDEX IF NOT EXISTS idx_team_members_battle_tag_trgm
--     ON public.team_members USING gin (lower(battle_tag) gin_trgm_ops);
--   CREATE INDEX IF NOT EXISTS idx_team_members_user_id
--     ON public.team_members (user_id);
--
-- Laissés hors de cette migration pour ne pas ajouter d'index spéculatif.
