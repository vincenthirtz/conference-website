-- Migration: `banned_until` + filtres « suspendu » / « sans Discord »
-- Date: 2026-08-21
--
-- WHY:
--   1. La seule sanction disponible depuis /admin/users/manage était la
--      SUPPRESSION définitive du compte (avec ses appartenances d'équipe et son
--      accès staff). Supabase Auth sait suspendre temporairement
--      (`auth.users.banned_until`) et cette capacité n'était utilisée nulle
--      part dans le repo. Pour l'exposer, la liste doit savoir qui est
--      suspendu : on ajoute `banned_until` aux colonnes renvoyées.
--   2. La liaison Discord (`user_discord_links`) conditionne toute la synchro
--      des rôles Discord et les DM du bot, mais rien dans l'admin ne disait qui
--      est lié. On ajoute un filtre « sans Discord » (le badge, lui, est enrichi
--      côté handler pour la page courante).
--
--   Deux nouvelles valeurs reconnues dans `p_filters` :
--     'suspended'  → banned_until dans le futur
--     'no_discord' → aucune ligne user_discord_links
--
-- RÉTRO-COMPATIBILITÉ :
--   Les paramètres sont INCHANGÉS ; seule la table de retour gagne une colonne,
--   ce qui impose un DROP (on ne peut pas CREATE OR REPLACE en changeant le
--   type de retour). Un appelant qui ignore `banned_until` continue de marcher.
--
-- SÉCURITÉ / SÉMANTIQUE : identiques à add_admin_list_users_filters.sql.

BEGIN;

DROP FUNCTION IF EXISTS public.admin_list_users(text, text, int, int, text, text, text[]);

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_query   text   DEFAULT NULL,
  p_role    text   DEFAULT NULL,
  p_limit   int    DEFAULT 20,
  p_offset  int    DEFAULT 0,
  p_sort    text   DEFAULT 'created_at',
  p_dir     text   DEFAULT 'desc',
  p_filters text[] DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  email           text,
  role            text,
  display_name    text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  banned_until    timestamptz,
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
      coalesce(p_filters, ARRAY[]::text[]) AS f,
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
      u.last_sign_in_at,
      u.banned_until
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
      AND (
        NOT ('staff' = ANY(norm.f))
        OR lower(u.raw_user_meta_data->>'role') IN ('caster', 'admin', 'owner')
      )
      AND (
        NOT ('community' = ANY(norm.f))
        OR coalesce(lower(u.raw_user_meta_data->>'role'), 'member')
             NOT IN ('caster', 'admin', 'owner')
      )
      AND (
        NOT ('no_team' = ANY(norm.f))
        OR NOT EXISTS (
          SELECT 1 FROM public.team_members tm WHERE tm.user_id = u.id
        )
      )
      AND (
        NOT ('never_signed_in' = ANY(norm.f))
        OR u.last_sign_in_at IS NULL
      )
      AND (
        NOT ('inactive_6m' = ANY(norm.f))
        OR u.last_sign_in_at IS NULL
        OR u.last_sign_in_at < now() - interval '6 months'
      )
      AND (
        NOT ('suspended' = ANY(norm.f))
        OR (u.banned_until IS NOT NULL AND u.banned_until > now())
      )
      AND (
        NOT ('no_discord' = ANY(norm.f))
        OR NOT EXISTS (
          SELECT 1
          FROM public.user_discord_links dl
          WHERE dl.auth_user_id = u.id
        )
      )
      AND (
        NOT ('battletag_mismatch' = ANY(norm.f))
        OR EXISTS (
          SELECT 1
          FROM public.team_members tm
          LEFT JOIN public.user_battlenet_links bl ON bl.auth_user_id = u.id
          WHERE tm.user_id = u.id
            AND (
              (tm.verified_battle_net_id IS NOT NULL
                AND tm.battle_tag_verified_at IS NULL)
              OR (
                NULLIF(lower(trim(bl.battle_tag)), '') IS NOT NULL
                AND NULLIF(lower(trim(tm.battle_tag)), '') IS NOT NULL
                AND lower(trim(bl.battle_tag)) <> lower(trim(tm.battle_tag))
              )
            )
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
    f.banned_until,
    count(*) OVER() AS total_count
  FROM filtered f, norm
  ORDER BY
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
    (CASE
       WHEN norm.d = 'asc' AND norm.s = 'created_at'      THEN f.created_at
       WHEN norm.d = 'asc' AND norm.s = 'last_sign_in_at' THEN f.last_sign_in_at
     END) ASC NULLS LAST,
    (CASE
       WHEN norm.d = 'desc' AND norm.s = 'created_at'      THEN f.created_at
       WHEN norm.d = 'desc' AND norm.s = 'last_sign_in_at' THEN f.last_sign_in_at
     END) DESC NULLS LAST,
    f.created_at DESC, f.id
  LIMIT p_limit OFFSET p_offset;
$$;

COMMENT ON FUNCTION public.admin_list_users(text, text, int, int, text, text, text[]) IS
  'Liste admin paginee des utilisateurs (+ banned_until). Filtre role, recherche '
  '4 axes, filtres rapides (p_filters subset of {staff,community,no_team,'
  'never_signed_in,inactive_6m,suspended,no_discord,battletag_mismatch}), tri '
  'parametrable, pagination, total_count = count(*) OVER(). La clause '
  'battletag_mismatch duplique utils/auth/battleTagMismatch.ts - garder en phase. '
  'SECURITY DEFINER ; EXECUTE reserve a service_role.';

REVOKE ALL ON FUNCTION public.admin_list_users(text, text, int, int, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users(text, text, int, int, text, text, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_users(text, text, int, int, text, text, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, text, int, int, text, text, text[]) TO service_role;

COMMIT;
