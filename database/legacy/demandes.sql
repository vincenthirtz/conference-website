-- ARCHIVÉ le 2026-06-26 : versionné dans migrations/create_demandes_table.sql
--   (table + colonnes + index + trigger + RLS/policies consolidés). Les noms de FK
--   explicites venaient de demandes_fix_foreign_keys.sql, eux aussi consolidés dans
--   la migration. Conservé pour historique — NE PAS exécuter, NE PAS appliquer.
-- =====================================================================

-- database/demandes.sql
-- Migration pour ajouter les colonnes manquantes à la table demandes
-- Exécuter ce script dans le SQL Editor de Supabase

-- D'abord, vérifier la structure actuelle (optionnel, pour debug)
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'demandes';

-- Ajouter les colonnes manquantes (ignorer les erreurs si elles existent déjà)
DO $$
BEGIN
  -- user_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'user_id') THEN
    ALTER TABLE demandes ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- team_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'team_id') THEN
    ALTER TABLE demandes ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
  END IF;

  -- tournament_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'tournament_id') THEN
    ALTER TABLE demandes ADD COLUMN tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL;
  END IF;

  -- type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'type') THEN
    ALTER TABLE demandes ADD COLUMN type TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('join', 'leave', 'captain_request', 'other'));
  END IF;

  -- status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'status') THEN
    ALTER TABLE demandes ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));
  END IF;

  -- comment
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'comment') THEN
    ALTER TABLE demandes ADD COLUMN comment TEXT;
  END IF;

  -- staff_note
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'staff_note') THEN
    ALTER TABLE demandes ADD COLUMN staff_note TEXT;
  END IF;

  -- processed_by_staff_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'processed_by_staff_id') THEN
    ALTER TABLE demandes ADD COLUMN processed_by_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL;
  END IF;

  -- processed_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'processed_at') THEN
    ALTER TABLE demandes ADD COLUMN processed_at TIMESTAMPTZ;
  END IF;

  -- source
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'source') THEN
    ALTER TABLE demandes ADD COLUMN source TEXT;
  END IF;

  -- payload
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'payload') THEN
    ALTER TABLE demandes ADD COLUMN payload JSONB;
  END IF;

  -- created_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'created_at') THEN
    ALTER TABLE demandes ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  -- updated_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'demandes' AND column_name = 'updated_at') THEN
    ALTER TABLE demandes ADD COLUMN updated_at TIMESTAMPTZ;
  END IF;
END $$;

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_demandes_user_id ON demandes(user_id);
CREATE INDEX IF NOT EXISTS idx_demandes_team_id ON demandes(team_id);
CREATE INDEX IF NOT EXISTS idx_demandes_type ON demandes(type);
CREATE INDEX IF NOT EXISTS idx_demandes_status ON demandes(status);
CREATE INDEX IF NOT EXISTS idx_demandes_created_at ON demandes(created_at DESC);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_demandes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS demandes_updated_at ON demandes;
CREATE TRIGGER demandes_updated_at
  BEFORE UPDATE ON demandes
  FOR EACH ROW
  EXECUTE FUNCTION update_demandes_updated_at();

-- RLS (Row Level Security)
ALTER TABLE demandes ENABLE ROW LEVEL SECURITY;

-- Politique: les utilisateurs peuvent voir leurs propres demandes
CREATE POLICY "Users can view own demandes"
  ON demandes FOR SELECT
  USING (auth.uid() = user_id);

-- Politique: les utilisateurs peuvent créer des demandes
CREATE POLICY "Users can create demandes"
  ON demandes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Note: Les staff peuvent tout voir/modifier via le service role (supabaseAdmin)
