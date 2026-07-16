-- Migration: tri paramétrable pour public.admin_list_users
-- Date: 2026-07-17
--
-- WHY:
--   La liste admin (pages/admin/users/manage) n'offrait qu'un tri fixe
--   created_at DESC. On ajoute deux paramètres OPTIONNELS `p_sort` / `p_dir`
--   pour trier côté serveur (donc cohérent avec la pagination) sur les axes :
--   created_at (défaut), display_name, email, role, last_sign_in_at.
--
-- RÉTRO-COMPATIBILITÉ :
--   Les nouveaux paramètres ont des DEFAULT ('created_at' / 'desc') identiques
--   à l'ancien comportement. On DROP puis recrée la fonction : l'ancienne
--   signature 4-args disparaît pour éviter toute ambiguïté d'overload ; le
--   handler qui passe encore 4 args nommés résout vers la nouvelle fonction via
--   les defaults, comportement INCHANGÉ (created_at DESC + tiebreaker id).
--
-- SÉCURITÉ / SÉMANTIQUE : identiques à add_admin_list_users_function.sql
--   (SECURITY DEFINER, search_path pin, EXECUTE réservé à service_role, mêmes
--   filtres rôle + recherche 4 axes, total_count = count(*) OVER()).
--   `p_sort` / `p_dir` sont validés par un whitelist via CASE (aucune valeur
--   inconnue n'atteint l'ORDER BY : fallback sur created_at DESC).

BEGIN;

DROP FUNCTION IF EXISTS public.admin_list_users(text, text, int, int);

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_query  text DEFAULT NULL,
  p_role   text DEFAULT NULL,
  p_limit  int  DEFAULT 20,
  p_offset int  DEFAULT 0,
  p_sort   text DEFAULT 'created_at',
  p_dir    text DEFAULT 'desc'
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
      NULLIF(lower(trim(p_role)),  '') AS r,
      -- whitelist tri : toute valeur inconnue retombe sur created_at
      CASE lower(coalesce(p_sort, 'created_at'))
        WHEN 'display_name'    THEN 'display_name'
        WHEN 'email'           THEN 'email'
        WHEN 'role'            THEN 'role'
        WHEN 'last_sign_in_at' THEN 'last_sign_in_at'
        ELSE 'created_at'
      END AS s,
      CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END AS d
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
      (norm.r IS NULL OR lower(u.raw_user_meta_data->>'role') = norm.r)
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
  FROM filtered f, norm
  ORDER BY
    -- Axes texte
    (CASE
       WHEN norm.d = 'asc' AND norm.s = 'display_name' THEN lower(f.display_name)
       WHEN norm.d = 'asc' AND norm.s = 'email'        THEN lower(f.email)
       WHEN norm.d = 'asc' AND norm.s = 'role'         THEN f.role
     END) ASC NULLS LAST,
    (CASE
       WHEN norm.d = 'desc' AND norm.s = 'display_name' THEN lower(f.display_name)
       WHEN norm.d = 'desc' AND norm.s = 'email'        THEN lower(f.email)
       WHEN norm.d = 'desc' AND norm.s = 'role'         THEN f.role
     END) DESC NULLS LAST,
    -- Axes date
    (CASE
       WHEN norm.d = 'asc' AND norm.s = 'created_at'      THEN f.created_at
       WHEN norm.d = 'asc' AND norm.s = 'last_sign_in_at' THEN f.last_sign_in_at
     END) ASC NULLS LAST,
    (CASE
       WHEN norm.d = 'desc' AND norm.s = 'created_at'      THEN f.created_at
       WHEN norm.d = 'desc' AND norm.s = 'last_sign_in_at' THEN f.last_sign_in_at
     END) DESC NULLS LAST,
    -- Tiebreaker déterministe (pagination stable)
    f.created_at DESC, f.id
  LIMIT p_limit OFFSET p_offset;
$$;

COMMENT ON FUNCTION public.admin_list_users(text, text, int, int, text, text) IS
  'Liste admin paginée des utilisateurs. Filtre rôle, recherche 4 axes, tri '
  'paramétrable (p_sort ∈ {created_at,display_name,email,role,last_sign_in_at}, '
  'p_dir ∈ {asc,desc}, whitelist via CASE), pagination LIMIT/OFFSET, total_count '
  '= count(*) OVER(). SECURITY DEFINER ; EXECUTE réservé à service_role.';

REVOKE ALL ON FUNCTION public.admin_list_users(text, text, int, int, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users(text, text, int, int, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_users(text, text, int, int, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, text, int, int, text, text) TO service_role;

COMMIT;
