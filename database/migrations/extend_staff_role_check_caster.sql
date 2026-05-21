-- Migration: ajout du rôle 'caster' à la CHECK constraint staff_role_check
-- Date: 2026-05-21
--
-- WHY:
--   Découvert au Lot 5c (tests e2e) de la feature "Run-of-show" :
--     - utils/staff.ts déclare 'caster' comme rôle valide côté code.
--     - Le trigger cast_members_enforce_staff_caster exige staff.role='caster'.
--     - Mais la CHECK constraint staff_role_check sur public.staff n'autorise
--       que 'owner','admin','manager','referee','helper'.
--   Résultat : impossible de créer un caster end-to-end (INSERT bloqué
--   par la CHECK). Les 5 tests caster-cockpit.spec.ts golden path ont été
--   skippés en attendant ce fix.
--
--   Cette migration étend la CHECK pour autoriser 'caster' sans toucher
--   les autres rôles existants.
--
-- CAVEATS:
--   - DROP/ADD CHECK dans la même transaction : idempotent au sens où la
--     contrainte finale est toujours la version étendue.
--   - Les casters existants en cast_members ne sont pas affectés (ils n'ont
--     pas de row dans staff aujourd'hui, sinon la CHECK aurait déjà bloqué).
--   - Le trigger cast_members_enforce_staff_caster pourra désormais
--     fonctionner correctement lors d'un INSERT cast_members.

BEGIN;

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_role_check;

ALTER TABLE public.staff ADD CONSTRAINT staff_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'referee', 'helper', 'caster'));

COMMIT;
