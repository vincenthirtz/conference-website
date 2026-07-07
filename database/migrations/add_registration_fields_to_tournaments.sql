-- Migration: Custom registration fields per tournament
-- Date: 2026-07-07
--
-- Purpose:
--   Lets an organiser configure a set of custom form fields on a tournament,
--   and stores each registering team's answers to those fields. Powers the
--   "custom registration fields per tournament" feature (dynamic sign-up form).
--
-- Adds two loose-object JSONB columns (versioning convention: shapes live in
-- application code / this comment, NOT in a rigid CREATE TABLE — same style as
-- teams.achievements / teams.sponsors in add_team_rich_sections.sql):
--
--   1. tournaments.registration_fields  -> ordered array of field DEFINITIONS
--      An array whose element shape is:
--        {
--          "key":       string  -- snake_case, unique per tournament (form id)
--          "label":     string  -- human label shown above the input
--          "type":      "text" | "textarea" | "select" | "checkbox"
--                       | "number" | "url"
--          "required":  boolean
--          "options"?:  string[]  -- only for type "select"
--          "help"?:     string    -- optional helper/hint text
--          "maxLength"? number     -- optional cap for text/textarea
--        }
--      Default '[]' = no custom fields (registration form shows built-ins only).
--
--   2. tournament_teams.field_values  -> the registering team's ANSWERS
--      An object keyed by the field "key" -> value, e.g.
--        { "jersey_size": "M", "arrival_day": "friday", "needs_pc": true }
--      Value type follows the field "type": string | number | boolean.
--      Default '{}' = no answers recorded. tournament_teams is the canonical
--      registration record (unique on (tournament_id, team_id)).
--
-- RLS / tenancy:
--   Both tables carry tenant_id and already have their RLS baseline. These are
--   additive, NOT-NULL-with-default columns only -> no new/changed policy and
--   no tenant backfill needed. Existing rows get the default value in place.
--
-- Schema cache:
--   Purely additive (columns only, no FK, no relationship change) -> no
--   PostgREST schema-cache reload required.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS registration_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE tournament_teams
  ADD COLUMN IF NOT EXISTS field_values jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tournaments.registration_fields IS
  'Ordered JSONB array of custom registration field definitions. Element shape: {key: snake_case unique per tournament, label, type: text|textarea|select|checkbox|number|url, required: bool, options?: string[] (select only), help?: string, maxLength?: number}. Default [] = no custom fields.';

COMMENT ON COLUMN tournament_teams.field_values IS
  'JSONB object of the registering team''s answers to the tournament''s registration_fields, keyed by field key -> value (string | number | boolean per the field type). Default {} = no answers.';
