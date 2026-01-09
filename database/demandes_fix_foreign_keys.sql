-- database/demandes_fix_foreign_keys.sql
-- Fix foreign key relationships for PostgREST compatibility
-- Run this in Supabase SQL Editor

-- Step 1: Check if foreign keys exist and add them with explicit names if missing
DO $$
BEGIN
  -- Check and add user_id foreign key with explicit name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'demandes_user_id_fkey'
    AND table_name = 'demandes'
  ) THEN
    -- Drop column if it exists without FK
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'user_id') THEN
      ALTER TABLE demandes DROP COLUMN user_id;
    END IF;
    -- Re-add with explicit FK name
    ALTER TABLE demandes
      ADD COLUMN user_id UUID,
      ADD CONSTRAINT demandes_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES auth.users(id)
        ON DELETE CASCADE;
    RAISE NOTICE 'Added user_id foreign key constraint';
  END IF;

  -- Check and add team_id foreign key with explicit name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'demandes_team_id_fkey'
    AND table_name = 'demandes'
  ) THEN
    -- Drop column if it exists without FK
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'team_id') THEN
      ALTER TABLE demandes DROP COLUMN team_id;
    END IF;
    -- Re-add with explicit FK name
    ALTER TABLE demandes
      ADD COLUMN team_id UUID,
      ADD CONSTRAINT demandes_team_id_fkey
        FOREIGN KEY (team_id)
        REFERENCES teams(id)
        ON DELETE SET NULL;
    RAISE NOTICE 'Added team_id foreign key constraint';
  END IF;

  -- Check and add tournament_id foreign key with explicit name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'demandes_tournament_id_fkey'
    AND table_name = 'demandes'
  ) THEN
    -- Drop column if it exists without FK
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'tournament_id') THEN
      ALTER TABLE demandes DROP COLUMN tournament_id;
    END IF;
    -- Re-add with explicit FK name
    ALTER TABLE demandes
      ADD COLUMN tournament_id UUID,
      ADD CONSTRAINT demandes_tournament_id_fkey
        FOREIGN KEY (tournament_id)
        REFERENCES tournaments(id)
        ON DELETE SET NULL;
    RAISE NOTICE 'Added tournament_id foreign key constraint';
  END IF;

END $$;

-- Step 2: Verify foreign keys are created
SELECT
  constraint_name,
  table_name,
  column_name
FROM information_schema.key_column_usage
WHERE table_name = 'demandes'
  AND constraint_name LIKE '%_fkey'
ORDER BY constraint_name;

-- Step 3: IMPORTANT - After running this script, you MUST reload the PostgREST schema cache
-- Go to: Supabase Dashboard > Settings > API > "Reload schema cache" button
-- OR run this query:
-- NOTIFY pgrst, 'reload schema';

-- Note: The NOTIFY command might not work depending on your Supabase setup
-- If it doesn't work, manually reload the schema cache from the dashboard
