-- database/migrations/add_transfer_type_to_demandes.sql
-- Add 'transfer' to the demandes type check constraint
-- Run this in the Supabase SQL Editor

-- Drop old constraint and recreate with 'transfer' included
ALTER TABLE demandes DROP CONSTRAINT IF EXISTS demandes_type_check;
ALTER TABLE demandes ADD CONSTRAINT demandes_type_check
  CHECK (type IN ('join', 'leave', 'captain_request', 'team_registration', 'transfer', 'other'));
