-- Migration: fonction SECURITY DEFINER `public.admin_get_user_profiles(uuid[])`
-- Date: 2026-07-10
--
-- WHY (audit perf P6):
--   L'enrichissement d'affichage (handler demandes, notamment) résolvait le
--   profil de chaque utilisateur listé via une boucle N+1 de
--   `auth.admin.getUserById(id)` : un round-trip GoTrue PAR utilisateur pour
--   lire email + user_metadata (display_name, full_name, avatar_url, battle_tag,
--   discord). Coût réseau linéaire dans le nombre de lignes affichées, sur un
--   chemin chaud de rendu de liste.
--
--   Cette fonction résout N profils en UN SEUL appel : un `SELECT ... WHERE
--   id = ANY(p_ids)` sur `auth.users`, indexable (PK) côté Postgres, qui
--   remplace les N appels getUserById. Le handler n'a plus qu'à faire un
--   `.rpc('admin_get_user_profiles', { p_ids })` puis à indexer le résultat par id.
--
-- SECURITY DEFINER :
--   L'accès au schéma `auth` (table auth.users, colonne email) est réservé au
--   propriétaire. La fonction s'exécute donc avec les droits du définisseur pour
--   lire auth.users, tout en restant cloisonnée (même posture que
--   `get_user_id_by_email` / `admin_search_users`) :
--   - `SET search_path = public, auth, pg_temp` pin le résolveur de noms
--     (anti schema-hijacking, cf. fix_function_search_path.sql / advisor 0011).
--   - EXECUTE accordé UNIQUEMENT à service_role (les handlers utilisent
--     supabaseAdmin). Révoqué de PUBLIC/anon/authenticated : aucune énumération
--     de profils/emails possible via l'API publique.
--
-- SÉMANTIQUE (parité stricte avec l'enrichissement getUserById actuel) :
--   - Chaque colonne renvoyée reproduit EXACTEMENT ce que le handler lit
--     aujourd'hui via `auth.admin.getUserById(id)` :
--       id           ← user.id
--       email        ← user.email
--       display_name ← user.user_metadata.display_name
--       full_name    ← user.user_metadata.full_name
--       avatar_url   ← user.user_metadata.avatar_url
--       battle_tag   ← user.user_metadata.battle_tag   (metadata, PAS team_members)
--       discord      ← user.user_metadata.discord
--     Les champs metadata viennent de `raw_user_meta_data` (le stockage Postgres
--     de `user_metadata` côté GoTrue). Le battle_tag est bien pris dans le
--     metadata ici — parité stricte avec getUserById, aucune jointure team_members.
--   - `p_ids` vide ou NULL → 0 ligne (`id = ANY(NULL)` / `ANY('{}')` ne matche
--     rien). Le handler gère ce cas en amont.
--   - `p_ids` est un PARAMÈTRE lié (ANY) : aucune concaténation SQL dynamique.
--
-- CAVEATS:
--   - Idempotente : CREATE OR REPLACE FUNCTION, REVOKE/GRANT rejouables.
--   - Pas de reload du cache PostgREST nécessaire pour une fonction RPC pure
--     (aucune FK modifiée). Le premier appel `.rpc(...)` la découvre.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_get_user_profiles(p_ids uuid[])
RETURNS TABLE (
  id           uuid,
  email        text,
  display_name text,
  full_name    text,
  avatar_url   text,
  battle_tag   text,
  discord      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    u.id,
    u.email::text,
    u.raw_user_meta_data->>'display_name',
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'avatar_url',
    u.raw_user_meta_data->>'battle_tag',
    u.raw_user_meta_data->>'discord'
  FROM auth.users u
  WHERE u.id = ANY(p_ids);
$$;

COMMENT ON FUNCTION public.admin_get_user_profiles(uuid[]) IS
  'Résout N profils utilisateurs (email + user_metadata) en un seul appel via '
  'id = ANY(p_ids) sur auth.users. Remplace la boucle N+1 auth.admin.getUserById '
  'de l''enrichissement d''affichage (handler demandes). battle_tag vient du '
  'user_metadata (parité stricte getUserById), pas de team_members. SECURITY '
  'DEFINER pour lire auth.users ; EXECUTE réservé à service_role.';

-- EXECUTE : uniquement service_role (supabaseAdmin). Jamais anon/authenticated.
REVOKE ALL ON FUNCTION public.admin_get_user_profiles(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_user_profiles(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.admin_get_user_profiles(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profiles(uuid[]) TO service_role;

COMMIT;
