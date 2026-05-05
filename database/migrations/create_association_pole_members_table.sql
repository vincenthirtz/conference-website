-- Migration: Create association_pole_members table
-- Description: Stores members of each "pôle" (working group) of the association,
-- displayed on the /association page. Pôle metadata (title/desc/icon) stays in
-- code; only the members are administrable via the back-office.

CREATE TABLE IF NOT EXISTS association_pole_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pole_key TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT association_pole_members_pole_key_check
    CHECK (pole_key IN ('direction', 'tournoi', 'production', 'communaute'))
);

CREATE INDEX IF NOT EXISTS idx_association_pole_members_pole_active_order
  ON association_pole_members (pole_key, is_active, sort_order ASC);

CREATE OR REPLACE FUNCTION update_association_pole_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS association_pole_members_updated_at
  ON association_pole_members;
CREATE TRIGGER association_pole_members_updated_at
  BEFORE UPDATE ON association_pole_members
  FOR EACH ROW
  EXECUTE FUNCTION update_association_pole_members_updated_at();

COMMENT ON TABLE association_pole_members IS
  'Members of each pôle of the association, displayed on /association.';
COMMENT ON COLUMN association_pole_members.pole_key IS
  'Pôle identifier: direction | tournoi | production | communaute.';
COMMENT ON COLUMN association_pole_members.name IS 'Display name (pseudo).';
COMMENT ON COLUMN association_pole_members.title IS 'Role inside the pôle (e.g. Présidente).';
COMMENT ON COLUMN association_pole_members.description IS 'Short bio (optional).';
COMMENT ON COLUMN association_pole_members.image_url IS 'Avatar URL (optional).';
COMMENT ON COLUMN association_pole_members.link_url IS 'Twitch / social / contact URL (optional).';
COMMENT ON COLUMN association_pole_members.sort_order IS 'Display order within the pôle (lower = first).';

-- Initial seed: Direction & admin
INSERT INTO association_pole_members (pole_key, name, sort_order)
VALUES
  ('direction', 'Arukdo',     1),
  ('direction', 'La_Kiiroii',   2),
  ('direction', 'Anrataria',  3),
  ('direction', 'Altoy',      4)
ON CONFLICT DO NOTHING;
