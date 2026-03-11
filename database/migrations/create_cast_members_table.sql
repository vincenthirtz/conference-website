-- Migration: Create cast_members table
-- Description: Stores cast members (casteuses) displayed on the association page

CREATE TABLE IF NOT EXISTS cast_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  title TEXT,
  description TEXT,
  image_url TEXT,
  twitch_url TEXT,
  city TEXT,
  is_active BOOLEAN DEFAULT true,
  is_promo BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for active cast members sorted by order
CREATE INDEX IF NOT EXISTS idx_cast_members_active_order
ON cast_members (is_active, sort_order ASC);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_cast_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cast_members_updated_at ON cast_members;
CREATE TRIGGER cast_members_updated_at
  BEFORE UPDATE ON cast_members
  FOR EACH ROW
  EXECUTE FUNCTION update_cast_members_updated_at();

-- RLS policies (if RLS is enabled on your database)
-- ALTER TABLE cast_members ENABLE ROW LEVEL SECURITY;

-- Allow public read access for active cast members
-- CREATE POLICY "Allow public read" ON cast_members
--   FOR SELECT USING (is_active = true);

-- Allow authenticated staff to manage cast members (via service role)
-- Service role bypasses RLS, so admin operations work without additional policies

COMMENT ON TABLE cast_members IS 'Cast members displayed on the association page';
COMMENT ON COLUMN cast_members.name IS 'Display name of the cast member';
COMMENT ON COLUMN cast_members.title IS 'Title/role (e.g., Streameuse Overwatch)';
COMMENT ON COLUMN cast_members.image_url IS 'URL to profile image';
COMMENT ON COLUMN cast_members.twitch_url IS 'Full Twitch URL or other link';
COMMENT ON COLUMN cast_members.city IS 'Location (e.g., France, Suisse)';
COMMENT ON COLUMN cast_members.is_promo IS 'If true, this is a promotional card (e.g., "Join the cast")';
COMMENT ON COLUMN cast_members.sort_order IS 'Display order (lower = first)';

-- Initial data from speakers.json
INSERT INTO cast_members (name, title, image_url, twitch_url, city, is_active, is_promo, sort_order)
VALUES
  ('Gwadael', 'Streameuse Overwatch', '/img/speaker-images/gwadael.jpg', 'https://www.twitch.tv/gwadael', 'France', true, false, 1),
  ('Crocheh', 'Streameuse Overwatch', '/img/speaker-images/crocheh.jpeg', 'https://www.twitch.tv/crocheh', 'Suisse', true, false, 2),
  ('Envie de rejoindre le cast ?', '', '/img/mic.jpg', '/contact', '', true, true, 3)
ON CONFLICT DO NOTHING;
