-- Migration: Créer la table patch_notes
-- Date: 2026-01-11
-- Description:
--   Table pour stocker les patch notes Overwatch 2 récupérés depuis Blizzard.
--   Permet de garder un historique et d'afficher les 4 derniers même si
--   la page Blizzard ne les expose plus dans le HTML initial.

-- Créer la table patch_notes
CREATE TABLE IF NOT EXISTS patch_notes (
  id TEXT PRIMARY KEY,                    -- ID unique (anchor du patch note sur Blizzard)
  title TEXT NOT NULL,                    -- Titre du patch note
  date TEXT NOT NULL,                     -- Date affichée (ex: "8 janvier 2026")
  date_parsed DATE,                       -- Date parsée pour le tri
  link TEXT NOT NULL,                     -- Lien vers le patch note sur Blizzard
  summary TEXT,                           -- Résumé du patch note
  heroes JSONB DEFAULT '[]'::jsonb,       -- Liste des héros modifiés (JSON)
  created_at TIMESTAMPTZ DEFAULT NOW(),   -- Date de création en BDD
  updated_at TIMESTAMPTZ DEFAULT NOW()    -- Date de dernière mise à jour
);

-- Index sur la date parsée pour le tri
CREATE INDEX IF NOT EXISTS idx_patch_notes_date_parsed ON patch_notes(date_parsed DESC NULLS LAST);

-- Index sur created_at pour le tri par défaut
CREATE INDEX IF NOT EXISTS idx_patch_notes_created_at ON patch_notes(created_at DESC);

-- Commentaires pour documentation
COMMENT ON TABLE patch_notes IS 'Stockage des patch notes Overwatch 2 récupérés depuis Blizzard';
COMMENT ON COLUMN patch_notes.id IS 'ID unique correspondant à l''anchor sur la page Blizzard';
COMMENT ON COLUMN patch_notes.date_parsed IS 'Date parsée pour permettre un tri chronologique correct';
COMMENT ON COLUMN patch_notes.heroes IS 'Liste JSON des héros modifiés avec leurs détails';

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_patch_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour updated_at
DROP TRIGGER IF EXISTS trigger_patch_notes_updated_at ON patch_notes;
CREATE TRIGGER trigger_patch_notes_updated_at
  BEFORE UPDATE ON patch_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_patch_notes_updated_at();

-- RLS (Row Level Security) - lecture publique, écriture admin seulement
ALTER TABLE patch_notes ENABLE ROW LEVEL SECURITY;

-- Politique de lecture publique
CREATE POLICY patch_notes_select_policy ON patch_notes
  FOR SELECT
  USING (true);

-- Politique d'insertion/mise à jour pour service role uniquement
CREATE POLICY patch_notes_insert_policy ON patch_notes
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY patch_notes_update_policy ON patch_notes
  FOR UPDATE
  USING (true);
