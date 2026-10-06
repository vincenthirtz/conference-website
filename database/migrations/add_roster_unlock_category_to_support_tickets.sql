-- Migration: catégorie `roster_unlock` sur support_tickets
-- Date: 2026-10-06
--
-- WHY:
--   Lot P7 « verrou de roster en self-service ». Une capitaine dont le roster
--   est verrouillé demande une dérogation depuis son espace (bouton du bandeau
--   « Roster verrouillé »). La demande est un ticket de support typé, visible
--   et filtrable dans /admin/support, plutôt qu'une nouvelle table.
--   Route : pages/api/teams/roster-unlock-request.ts
--   (features/player/team/service/rosterUnlock.ts).
--
-- CAVEATS:
--   - La contrainte d'origine est le CHECK inline de create_support_tickets_table.sql,
--     nommé automatiquement `support_tickets_category_check`. On la remplace
--     par une contrainte nommée, idempotente.
--   - Tant que cette migration n'est pas appliquée, la route se replie sur la
--     catégorie `other` (sujet préfixé « [Dérogation roster] ») : aucune
--     demande n'est perdue.

BEGIN;

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_category_check;
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_category_chk;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_category_chk
    CHECK (category IN ('dispute', 'behavior', 'technical', 'other', 'roster_unlock'));

COMMENT ON COLUMN public.support_tickets.category IS
  'dispute, behavior, technical, other, ou roster_unlock (demande de dérogation au verrou de roster, créée depuis l''espace capitaine).';

COMMIT;
