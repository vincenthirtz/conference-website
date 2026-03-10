-- Add missing timezone column to tournaments table
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS timezone text DEFAULT NULL;
