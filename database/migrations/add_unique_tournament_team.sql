-- Migration: add unique constraint on tournament_teams(tournament_id, team_id)
-- Prevents duplicate team registrations in the same tournament.
-- First, remove any existing duplicates (keep the oldest entry).

DELETE FROM public.tournament_teams a
  USING public.tournament_teams b
WHERE a.tournament_id = b.tournament_id
  AND a.team_id = b.team_id
  AND a.created_at > b.created_at;

ALTER TABLE public.tournament_teams
  ADD CONSTRAINT uq_tournament_teams_tournament_team
  UNIQUE (tournament_id, team_id);
