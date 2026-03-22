-- Ajouter la colonne forfeit_team_id pour stocker de manière structurée
-- quelle équipe a déclaré forfait (remplace le hack via notes textuelles).
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS forfeit_team_id UUID DEFAULT NULL REFERENCES teams(id) ON DELETE SET NULL;

-- Index pour requêter rapidement les matchs avec forfait
CREATE INDEX IF NOT EXISTS idx_matches_forfeit_team_id
  ON matches (forfeit_team_id)
  WHERE forfeit_team_id IS NOT NULL;

-- Commentaire pour documentation
COMMENT ON COLUMN matches.forfeit_team_id IS
  'ID de l''équipe ayant déclaré forfait. NULL = pas de forfait. Le winner est automatiquement l''adversaire.';
