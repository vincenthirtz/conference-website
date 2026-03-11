-- Add is_substitute column to team_members
-- Substitutes are not part of the active roster but can swap with active players.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS is_substitute BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.team_members.is_substitute
  IS 'Whether this member is a substitute (not on the active roster)';
