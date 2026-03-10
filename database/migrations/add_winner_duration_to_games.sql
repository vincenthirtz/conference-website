-- Migration: add winner_team_id and duration_minutes to games table
-- Allows game-level tracking of who won each map and how long it lasted.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS winner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_minutes INT;

CREATE INDEX IF NOT EXISTS idx_games_winner ON public.games (winner_team_id);
