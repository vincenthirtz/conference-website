-- Migration: fonction d'introspection des clés étrangères
--
-- WHY: le garde-fou tests/unit/supabaseSelectSchema.test.ts vérifie que chaque
--   COLONNE citée dans un `.select()` existe. Il ne vérifiait pas les indices
--   de relation (`teams!matches_team1_id_fkey`) — et c'est exactement ce qui a
--   cassé : la contrainte s'appelle `matches_team1_fk`, jamais
--   `matches_team1_id_fkey`. PostgREST rejette alors la requête ENTIÈRE
--   (PGRST200), et 19 appels répartis dans 8 fichiers répondaient 500 :
--   /admin/scrims/[id], la page publique d'un scrim, l'API bot d'un match,
--   les litiges, les conflits de tournoi, l'API caster.
--
--   Le document OpenAPI de PostgREST — source de l'instantané de schéma —
--   indique la table CIBLE d'une clé étrangère, mais pas le NOM de la
--   contrainte. D'où cette fonction : c'est la seule source fiable, et elle
--   permet au garde-fou de tourner hors ligne à partir de l'instantané.
--
-- WHAT: une fonction en lecture seule listant les clés étrangères du schéma
--   public. Volontairement SECURITY INVOKER (défaut) : elle ne lit que des
--   catalogues système déjà lisibles, inutile d'élever les droits.
--
--   L'exécution est RETIRÉE à `anon` et `authenticated`, puis accordée au seul
--   `service_role` : la topologie du schéma n'a rien à faire dans une réponse
--   publique.

BEGIN;

CREATE OR REPLACE FUNCTION public.introspect_foreign_keys()
RETURNS TABLE (
  constraint_name text,
  source_table text,
  target_table text
)
LANGUAGE sql
STABLE
AS $$
  SELECT c.conname::text,
         src.relname::text,
         tgt.relname::text
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_class tgt ON tgt.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = c.connamespace
   WHERE c.contype = 'f'
     AND n.nspname = 'public'
   ORDER BY c.conname;
$$;

COMMENT ON FUNCTION public.introspect_foreign_keys() IS
  'Cles etrangeres du schema public (nom, table source, table cible). Alimente database/schema-snapshot.json via scripts/refresh-schema-snapshot.mjs.';

REVOKE ALL ON FUNCTION public.introspect_foreign_keys() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.introspect_foreign_keys() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.introspect_foreign_keys() TO service_role;

COMMIT;
