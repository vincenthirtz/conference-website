-- Migration: RPC `public.count_confirmed_auth_users()` (Tier 2)
-- Date: 2026-07-15
--
-- WHY: utils/broadcasts.ts a besoin du nombre de comptes réellement confirmés
--   (email vérifié) pour dimensionner ses envois / estimer l'audience. Faire
--   `auth.admin.listUsers()` en boucle pour compter côté Node rapatrie toute la
--   base d'utilisateurs en mémoire à chaque appel (cf. add_admin_list_users_
--   function.sql, même anti-pattern). Ce RPC pousse le count dans Postgres :
--   le caller n'a plus qu'à faire un `.rpc('count_confirmed_auth_users')`.
--
-- SÉMANTIQUE: count(*) sur auth.users où email_confirmed_at IS NOT NULL.
--   Sur Supabase/GoTrue, la confirmation d'email est matérialisée par la colonne
--   auth.users.email_confirmed_at (non NULL une fois l'email vérifié). On
--   n'utilise PAS confirmed_at (colonne générée/dérivée) : email_confirmed_at
--   est la source canonique pour « email confirmé ».
--
-- SECURITY DEFINER: l'accès au schéma auth est réservé au propriétaire. La
--   fonction s'exécute avec les droits du définisseur pour lire auth.users, tout
--   en restant cloisonnée :
--     - SET search_path = public, auth pin le résolveur de noms (anti
--       schema-hijacking, cf. advisor 0011).
--     - EXECUTE réservé à service_role. Révoqué de PUBLIC/anon/authenticated :
--       aucune fuite de volumétrie de comptes via l'API publique.
--
-- CAVEATS:
--   - Idempotente : CREATE OR REPLACE FUNCTION, REVOKE/GRANT rejouables.
--   - Pas de reload du cache PostgREST nécessaire (RPC pur, aucune FK modifiée).

BEGIN;

CREATE OR REPLACE FUNCTION public.count_confirmed_auth_users()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT count(*)
  FROM auth.users
  WHERE email_confirmed_at IS NOT NULL;
$$;

COMMENT ON FUNCTION public.count_confirmed_auth_users() IS
  'Nombre de comptes auth.users dont l''email est confirmé '
  '(email_confirmed_at IS NOT NULL). Utilisé par utils/broadcasts.ts pour '
  'dimensionner l''audience sans rapatrier la base en mémoire. SECURITY '
  'DEFINER pour lire auth.users ; EXECUTE réservé à service_role.';

-- EXECUTE : uniquement service_role. Jamais anon/authenticated/PUBLIC.
REVOKE ALL ON FUNCTION public.count_confirmed_auth_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_confirmed_auth_users() FROM anon;
REVOKE ALL ON FUNCTION public.count_confirmed_auth_users() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_confirmed_auth_users() TO service_role;

COMMIT;
