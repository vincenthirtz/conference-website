-- Migration: fonction SECURITY DEFINER `public.get_user_id_by_email(text)`
-- Date: 2026-07-10
--
-- WHY (audit perf P8):
--   L'ajout d'un membre d'équipe (par email) résolvait l'utilisateur via
--   `listUsersEmailMap()` (utils/find-or-create-user.ts) : jusqu'à 5 pages de
--   1000 comptes `auth.admin.listUsers` (5000 users scannés) construites en
--   mémoire pour retrouver UN SEUL email. Coût réseau + mémoire linéaire dans le
--   nombre total de comptes, sur un chemin chaud (create-with-member, admin
--   members, discord/admin/captain add-member, admin demandes process).
--
--   Cette fonction fait le lookup CIBLÉ en un seul appel : un `SELECT ... WHERE
--   lower(email) = lower(trim(p_email))` sur `auth.users`, indexable et O(1) côté
--   Postgres, qui remplace le scan complet.
--
-- SECURITY DEFINER :
--   La colonne `auth.users.email` n'est lisible que par le propriétaire. La
--   fonction s'exécute donc avec les droits du définisseur, tout en restant
--   cloisonnée (même posture que `admin_search_users`) :
--   - `SET search_path = public, auth, pg_temp` pin le résolveur de noms
--     (anti schema-hijacking, cf. fix_function_search_path.sql / advisor 0011).
--   - EXECUTE accordé UNIQUEMENT à service_role (les handlers utilisent
--     supabaseAdmin). Révoqué de PUBLIC/anon/authenticated : aucune énumération
--     d'emails possible via l'API publique.
--
-- SÉMANTIQUE (parité stricte avec l'ancien lookup JS) :
--   - Normalisation : email := lower(trim(p_email)) ; si vide → NULL.
--   - Matching insensible à la casse (lower(email) = lower(trim(p_email))),
--     comme la Map JS qui indexait sur `u.email?.toLowerCase()`.
--   - Renvoie l'`id` (uuid) du premier compte correspondant, ou NULL si aucun.
--     `LIMIT 1` : l'email est unique dans auth.users (contrainte GoTrue), mais on
--     borne quand même pour un scalaire déterministe.
--   - `p_email` est un PARAMÈTRE lié : aucune concaténation SQL dynamique.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT u.id
  FROM auth.users u
  WHERE nullif(lower(trim(p_email)), '') IS NOT NULL
    AND lower(u.email) = lower(trim(p_email))
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_id_by_email(text) IS
  'Résolution ciblée email → auth.users.id (case-insensitive, exact). Remplace '
  'le scan listUsers (jusqu''à 5000 comptes) de listUsersEmailMap sur le chemin '
  'd''ajout de membre. SECURITY DEFINER pour lire auth.users.email ; EXECUTE '
  'réservé à service_role.';

-- EXECUTE : uniquement service_role (supabaseAdmin). Jamais anon/authenticated.
REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;

COMMIT;
