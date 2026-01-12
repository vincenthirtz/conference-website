-- Migration: Create blizzard_media table
-- Description: Store Overwatch media (comics, short stories, music, screenshots) from Blizzard

CREATE TABLE IF NOT EXISTS blizzard_media (
  id TEXT PRIMARY KEY,                          -- Unique ID (slug from URL or generated)
  title TEXT NOT NULL,
  type TEXT NOT NULL,                           -- 'comic', 'story', 'music', 'screenshot'
  category TEXT,                                -- Sub-category (hero name, map name, album name)
  link TEXT NOT NULL,
  thumbnail_url TEXT,                           -- Preview image
  description TEXT,
  parts INTEGER DEFAULT 1,                      -- For multi-part content (comics)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_blizzard_media_type ON blizzard_media(type);

-- RLS policies
ALTER TABLE blizzard_media ENABLE ROW LEVEL SECURITY;

-- Public read access (no auth needed)
CREATE POLICY "Public can read blizzard media"
  ON blizzard_media
  FOR SELECT
  TO public
  USING (true);

-- Service role can do everything
CREATE POLICY "Service role full access to blizzard media"
  ON blizzard_media
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_blizzard_media_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_blizzard_media_updated_at ON blizzard_media;
CREATE TRIGGER trigger_blizzard_media_updated_at
  BEFORE UPDATE ON blizzard_media
  FOR EACH ROW
  EXECUTE FUNCTION update_blizzard_media_updated_at();
