-- Migration: add is_joinable flag to teams
-- Allows teams to opt-in to receiving join requests from players

ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_joinable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN teams.is_joinable IS 'When true, players can request to join this team as player or sub';
