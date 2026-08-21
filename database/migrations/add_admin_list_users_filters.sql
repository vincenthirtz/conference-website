-- Migration: filtres rapides pour public.admin_list_users
-- Date: 2026-08-21
--
-- WHY:
--   La liste admin (pages/admin/users/manage) ne savait filtrer que sur le
--   rôle de compte. Les questions qu'on se pose vraiment en gestion d'événement
--   — « qui n'a pas d'équipe ? », « qui ne s'est jamais connecté ? », « quelles
--   lignes de roster ont une identité Battle.net incohérente ? » — obligeaient
--   à parcourir les pages à la main. Pire : le flag anti-smurf `battle_tag_
--   mismatch` était CALCULÉ et AFFICHÉ par l'API mais impossible à filtrer, donc
--   invisible en pratique.
--
--   On ajoute un paramètre OPTIONNEL `p_filters text[]` : chaque entrée reconnue
--   ajoute une clause AND. Les entrées inconnues sont ignorées (whitelist
--   implicite : on ne teste que les valeurs connues, aucune interpolation).
--
--   Valeurs reconnues :
--     'staff'              → rôle de compte ∈ (caster, admin, owner)
--     'community'          → rôle de compte ∉ (caster, admin, owner)
--     'no_team'            → aucune ligne team_members
--     'never_signed_in'    → last_sign_in_at IS NULL
--     'inactive_6m'        → jamais connecté OU dernière connexion > 6 mois
--     'battletag_mismatch' → au moins une ligne de roster en incohérence
--                            d'identité vérifiée (cf. ci-dessous)
--
-- ⚠ PARITÉ À TENIR : la clause 'battletag_mismatch' DUPLIQUE en SQL la logique
--   de `utils/auth/battleTagMismatch.ts` (computeBattleTagMismatch), qui reste
--   la source de vérité pour le BADGE affiché ligne par ligne. Les deux doivent
--   rester d'accord : si tu modifies l'un, modifie l'autre.
--     signal 1 : verified_battle_net_id renseigné MAIS battle_tag_verified_at NULL
--     signal 2 : lien Battle.net vérifié dont le tag diffère du tag roster
--
-- RÉTRO-COMPATIBILITÉ :
--   `p_filters` a un DEFAULT NULL traité comme « aucun filtre » : un appel qui
--   ne le passe pas se comporte exactement comme avant. On DROP la signature
--   6-args pour éviter toute ambiguïté d'overload côté PostgREST.
--
-- SÉCURITÉ / SÉMANTIQUE : identiques à add_admin_list_users_sort.sql
--   (SECURITY DEFINER, search_path pin, EXECUTE réservé à service_role, tri
--   whitelisté via CASE, total_count = count(*) OVER()).

BEGIN;

DROP FUNCTION IF EXISTS public.admin_list_users(text, text, int, int, text, text);

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
      -- Filtres rapides (AND entre eux ; un filtre absent = clause neutre).
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
        NOT ('battletag_mismatch' = ANY(norm.f))
        OR EXISTS (
          SELECT 1
          FROM public.team_members tm
          LEFT JOIN public.user_battlenet_links bl ON bl.auth_user_id = u.id
          WHERE tm.user_id = u.id
            AND (
              -- signal 1 : compte Blizzard rattaché mais ligne non estampillée
              (tm.verified_battle_net_id IS NOT NULL
                AND tm.battle_tag_verified_at IS NULL)
              -- signal 2 : tag du compte lié ≠ tag du roster
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

COMMENT ON FUNCTION public.admin_list_users(text, text, int, int, text, text, text[]) IS
  'Liste admin paginée des utilisateurs. Filtre rôle, recherche 4 axes, filtres '
  'rapides (p_filters ⊆ {staff,community,no_team,never_signed_in,inactive_6m,'
  'battletag_mismatch}, AND entre eux, inconnus ignorés), tri paramétrable, '
  'pagination LIMIT/OFFSET, total_count = count(*) OVER(). La clause '
  'battletag_mismatch duplique utils/auth/battleTagMismatch.ts — garder les deux '
  'en phase. SECURITY DEFINER ; EXECUTE réservé à service_role.';

REVOKE ALL ON FUNCTION public.admin_list_users(text, text, int, int, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users(text, text, int, int, text, text, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_users(text, text, int, int, text, text, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, text, int, int, text, text, text[]) TO service_role;

COMMIT;
