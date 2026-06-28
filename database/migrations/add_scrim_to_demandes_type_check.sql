-- database/migrations/add_scrim_to_demandes_type_check.sql
-- Adds 'scrim' to the demandes type check constraint.
-- 'scrim' rows are scrimmage (practice match) requests created by the new scrim
-- feature. They are inserted by pages/api/demandes/scrim.ts and
-- pages/api/public/scrim-requests.ts, both of which set type='scrim'.
--
-- BUG FIXED: the live demandes_type_check did NOT include 'scrim', so every
-- INSERT of a scrim demande failed with Postgres error 23514 (check_violation).
-- This migration widens the allowed-types list to unblock the scrim feature.
--
-- Why a full DROP + re-ADD : Postgres CHECK constraints can't be extended in
-- place, so we recreate the whole allowed-types list. EVERY value previously
-- allowed (see add_caster_application_type_to_demandes.sql, the latest
-- constraint migration) is preserved — nothing is dropped — plus the new
-- 'scrim'.
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
    'scrim',
    'other'
  ));
