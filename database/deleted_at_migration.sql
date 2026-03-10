-- database/deleted_at_migration.sql
-- Harmonise le pattern de soft-delete : ajoute deleted_at TIMESTAMPTZ à toutes les
-- tables qui utilisent is_active ou status='cancelled' pour le soft-delete.
-- Exécuter dans le SQL Editor de Supabase.

DO $$
BEGIN
  -- teams
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'deleted_at') THEN
    ALTER TABLE teams ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  -- tournament_stages
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_stages' AND column_name = 'deleted_at') THEN
    ALTER TABLE tournament_stages ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  -- matches
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'deleted_at') THEN
    ALTER TABLE matches ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  -- announcements
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'deleted_at') THEN
    ALTER TABLE announcements ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  -- partners
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'partners' AND column_name = 'deleted_at') THEN
    ALTER TABLE partners ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  -- cast_members
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cast_members' AND column_name = 'deleted_at') THEN
    ALTER TABLE cast_members ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  -- adherents
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'adherents' AND column_name = 'deleted_at') THEN
    ALTER TABLE adherents ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Back-fill deleted_at from existing soft-deleted rows
UPDATE teams SET deleted_at = COALESCE(updated_at, NOW()) WHERE is_active = false AND deleted_at IS NULL;
UPDATE tournament_stages SET deleted_at = COALESCE(updated_at, NOW()) WHERE is_active = false AND deleted_at IS NULL;
UPDATE matches SET deleted_at = COALESCE(updated_at, NOW()) WHERE status = 'cancelled' AND deleted_at IS NULL;
UPDATE announcements SET deleted_at = COALESCE(updated_at, NOW()) WHERE is_active = false AND deleted_at IS NULL;
UPDATE partners SET deleted_at = COALESCE(updated_at, NOW()) WHERE is_active = false AND deleted_at IS NULL;
UPDATE cast_members SET deleted_at = COALESCE(updated_at, NOW()) WHERE is_active = false AND deleted_at IS NULL;
UPDATE adherents SET deleted_at = COALESCE(updated_at, NOW()) WHERE is_active = false AND deleted_at IS NULL;

-- Index pour les requêtes recycle-bin (deleted_at IS NOT NULL)
CREATE INDEX IF NOT EXISTS idx_teams_deleted_at ON teams(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tournament_stages_deleted_at ON tournament_stages(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_deleted_at ON matches(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_deleted_at ON announcements(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partners_deleted_at ON partners(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cast_members_deleted_at ON cast_members(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_adherents_deleted_at ON adherents(deleted_at) WHERE deleted_at IS NOT NULL;

-- Ajouter 'team_registration' au check constraint de demandes.type
-- (pour la feature d'auto-inscription)
ALTER TABLE demandes DROP CONSTRAINT IF EXISTS demandes_type_check;
ALTER TABLE demandes ADD CONSTRAINT demandes_type_check
  CHECK (type IN ('join', 'leave', 'captain_request', 'team_registration', 'other'));
