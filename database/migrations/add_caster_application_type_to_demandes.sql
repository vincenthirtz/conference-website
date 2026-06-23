-- database/migrations/add_caster_application_type_to_demandes.sql
-- Adds 'caster_application' to the demandes type check constraint.
-- 'caster_application' rows are candidatures to become a caster/streamer for the
-- WomensCup broadcast crew (handled like any other demande in the staff queue).
-- Status flow : pending -> approved | rejected | cancelled.
--
-- Why a full DROP + re-ADD : Postgres CHECK constraints can't be extended in
-- place, so we recreate the whole allowed-types list. EVERY value previously
-- allowed (see add_invite_type_to_demandes.sql, the latest constraint migration)
-- is preserved — nothing is dropped — plus the new 'caster_application'.
--
-- Idempotent : DROP ... IF EXISTS + ADD recreates the constraint cleanly, so the
-- migration is safe to re-run from a clean attempt.
--
-- CAVEAT (PostgREST) : this only changes a CHECK constraint, no foreign key is
-- touched, so NO schema-cache reload is required for this migration. (Reminder
-- kept here for the next person: any FK add/change DOES need a reload — see
-- database/README_FOREIGN_KEYS.md.)

ALTER TABLE demandes DROP CONSTRAINT IF EXISTS demandes_type_check;
ALTER TABLE demandes ADD CONSTRAINT demandes_type_check
  CHECK (type IN (
    'join',
    'leave',
    'captain_request',
    'team_registration',
    'transfer',
    'invite',
    'caster_application',
    'other'
  ));
