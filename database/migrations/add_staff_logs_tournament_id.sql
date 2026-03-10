-- Add missing tournament_id column to staff_logs table
-- This column is used by the tournament history page to filter logs per tournament
ALTER TABLE staff_logs ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES tournaments(id) ON DELETE SET NULL;

-- Index for efficient filtering by tournament
CREATE INDEX IF NOT EXISTS idx_staff_logs_tournament_id ON staff_logs(tournament_id);
